from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict
from pathlib import Path

import torch

from .config import RunConfig, load_config
from .data import TextCorpus
from .model import ModelConfig, TinyLanguageModel
from .runtime import choose_device, set_seed
from .tokenizer import CharTokenizer


@torch.no_grad()
def estimate_loss(
    model: TinyLanguageModel,
    corpus: TextCorpus,
    config: RunConfig,
    device: torch.device,
) -> dict[str, float]:
    was_training = model.training
    model.eval()
    result: dict[str, float] = {}
    for split in ("train", "val"):
        losses = []
        for _ in range(config.eval_iters):
            x, y = corpus.get_batch(split, config.batch_size, device)
            _, loss = model(x, y)
            assert loss is not None
            losses.append(loss.item())
        result[split] = sum(losses) / len(losses)
    model.train(was_training)
    return result


def save_checkpoint(
    output_dir: Path,
    model: TinyLanguageModel,
    model_config: ModelConfig,
    run_config: RunConfig,
    tokenizer: CharTokenizer,
    step: int,
    metrics: dict[str, float],
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output_dir / "checkpoint.pt"
    torch.save(
        {
            "model_state": model.state_dict(),
            "model_config": asdict(model_config),
            "run_config": asdict(run_config),
            "tokenizer_tokens": tokenizer.tokens,
            "step": step,
            "metrics": metrics,
        },
        checkpoint_path,
    )
    tokenizer.save(output_dir / "tokenizer.json")
    return checkpoint_path


def train(config_path: str) -> Path:
    config = load_config(config_path)
    set_seed(config.seed)
    device = choose_device(config.device)
    output_dir = Path(config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    text = Path(config.data_path).read_text(encoding="utf-8")
    tokenizer = CharTokenizer.from_text(text)
    corpus = TextCorpus.from_text(
        text,
        tokenizer,
        config.block_size,
        config.train_fraction,
        config.seed,
    )
    model_config = ModelConfig(
        vocab_size=tokenizer.vocab_size,
        block_size=config.block_size,
        **config.model,
    )
    model = TinyLanguageModel(model_config).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.learning_rate,
        weight_decay=config.weight_decay,
    )

    fixed_batch = None
    if config.overfit_one_batch:
        fixed_batch = corpus.get_batch("train", config.batch_size, device)

    history: list[dict[str, float | int]] = []
    metrics_path = output_dir / "metrics.jsonl"
    metrics_path.write_text("", encoding="utf-8")
    started = time.perf_counter()
    last_metrics: dict[str, float] = {}

    print(
        f"device={device} parameters={model.parameter_count():,} "
        f"vocab={tokenizer.vocab_size} train_tokens={len(corpus.train_ids)} "
        f"val_tokens={len(corpus.val_ids)}"
    )

    for step in range(config.max_steps + 1):
        should_evaluate = step % config.eval_interval == 0 or step == config.max_steps
        if should_evaluate:
            last_metrics = estimate_loss(model, corpus, config, device)
            record = {
                "step": step,
                "train_loss": last_metrics["train"],
                "val_loss": last_metrics["val"],
                "elapsed_seconds": time.perf_counter() - started,
            }
            history.append(record)
            with metrics_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            print(
                f"step={step:5d} train_loss={last_metrics['train']:.4f} "
                f"val_loss={last_metrics['val']:.4f}"
            )

        if step == config.max_steps:
            break

        model.train()
        x, y = fixed_batch or corpus.get_batch("train", config.batch_size, device)
        optimizer.zero_grad(set_to_none=True)
        _, loss = model(x, y)
        assert loss is not None
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), config.grad_clip)
        optimizer.step()

        if (step + 1) % config.log_interval == 0:
            print(f"update={step + 1:5d} batch_loss={loss.item():.4f}")

    checkpoint = save_checkpoint(
        output_dir,
        model,
        model_config,
        config,
        tokenizer,
        config.max_steps,
        last_metrics,
    )

    model.eval()
    prompt_ids = torch.tensor(
        [tokenizer.encode(config.generate_prompt)], dtype=torch.long, device=device
    )
    generated = model.generate(
        prompt_ids,
        config.generate_tokens,
        config.temperature,
        config.top_k,
    )[0].tolist()
    sample = tokenizer.decode(generated)
    (output_dir / "sample.txt").write_text(sample, encoding="utf-8")
    (output_dir / "summary.json").write_text(
        json.dumps(
            {
                "checkpoint": str(checkpoint),
                "parameters": model.parameter_count(),
                "device": str(device),
                "final_metrics": last_metrics,
                "history": history,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"checkpoint={checkpoint}")
    print(f"sample={sample}")
    return checkpoint


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the educational tiny language model.")
    parser.add_argument("--config", required=True, help="Path to a YAML config.")
    args = parser.parse_args()
    train(args.config)


if __name__ == "__main__":
    main()
