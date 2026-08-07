from __future__ import annotations

import argparse

import torch

from .config import load_config
from .model import ModelConfig, TinyLanguageModel
from .runtime import choose_device, set_seed
from .tokenizer import CharTokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate from random, untrained weights.")
    parser.add_argument("--config", required=True)
    args = parser.parse_args()

    config = load_config(args.config)
    set_seed(config.seed)
    device = choose_device(config.device)
    text = open(config.data_path, encoding="utf-8").read()
    tokenizer = CharTokenizer.from_text(text)
    model = TinyLanguageModel(
        ModelConfig(
            vocab_size=tokenizer.vocab_size,
            block_size=config.block_size,
            **config.model,
        )
    ).to(device)
    model.eval()

    prompt = torch.tensor(
        [tokenizer.encode(config.generate_prompt)], dtype=torch.long, device=device
    )
    generated = model.generate(
        prompt,
        config.generate_tokens,
        config.temperature,
        config.top_k,
    )
    print(tokenizer.decode(generated[0].tolist()))


if __name__ == "__main__":
    main()
