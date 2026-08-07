from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from .checkpoint import load_checkpoint
from .config import RunConfig
from .data import TextCorpus
from .runtime import choose_device, set_seed
from .train import estimate_loss


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a tiny language model checkpoint.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--data", default=None, help="Optional replacement corpus path.")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--eval-iters", type=int, default=50)
    args = parser.parse_args()

    device = choose_device(args.device)
    model, tokenizer, payload = load_checkpoint(args.checkpoint, device)
    run_payload = payload["run_config"]
    if args.data is not None:
        run_payload["data_path"] = str(Path(args.data).resolve())
    run_payload["eval_iters"] = args.eval_iters
    config = RunConfig(**run_payload)
    set_seed(config.seed)

    text = Path(config.data_path).read_text(encoding="utf-8")
    corpus = TextCorpus.from_text(
        text,
        tokenizer,
        config.block_size,
        config.train_fraction,
        config.seed,
    )
    metrics = estimate_loss(model, corpus, config, device)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
