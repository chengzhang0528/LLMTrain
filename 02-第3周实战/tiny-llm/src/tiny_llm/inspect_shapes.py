from __future__ import annotations

import argparse
from pathlib import Path
from typing import Callable

import torch
from torch import nn

from .config import load_config
from .model import ModelConfig, TinyLanguageModel
from .tokenizer import CharTokenizer

ShapeRecord = tuple[str, tuple[int, ...]]


def collect_shape_trace(
    model: TinyLanguageModel, input_ids: torch.Tensor
) -> list[ShapeRecord]:
    records: list[ShapeRecord] = [("input_ids", tuple(input_ids.shape))]
    handles: list[torch.utils.hooks.RemovableHandle] = []

    def record(label: str) -> Callable[[nn.Module, tuple[torch.Tensor, ...], torch.Tensor], None]:
        def hook(
            _module: nn.Module,
            _inputs: tuple[torch.Tensor, ...],
            output: torch.Tensor,
        ) -> None:
            records.append((label, tuple(output.shape)))

        return hook

    handles.append(model.token_embedding.register_forward_hook(record("token_embedding")))
    handles.append(model.position_embedding.register_forward_hook(record("position_embedding")))

    for index, block in enumerate(model.blocks):
        prefix = f"block.{index}"

        def record_qkv(
            _module: nn.Module,
            _inputs: tuple[torch.Tensor, ...],
            output: torch.Tensor,
            label: str = prefix,
        ) -> None:
            batch, time, three_hidden = output.shape
            hidden = three_hidden // 3
            head_dim = hidden // model.config.n_head
            records.append((f"{label}.qkv", tuple(output.shape)))
            records.append(
                (
                    f"{label}.split_heads",
                    (batch, model.config.n_head, time, head_dim),
                )
            )
            records.append(
                (
                    f"{label}.attention_scores",
                    (batch, model.config.n_head, time, time),
                )
            )

        handles.append(block.attention.qkv.register_forward_hook(record_qkv))
        handles.append(
            block.attention.projection.register_forward_hook(
                record(f"{prefix}.attention_output")
            )
        )
        handles.append(
            block.mlp.layers[0].register_forward_hook(record(f"{prefix}.mlp_expand"))
        )
        handles.append(
            block.mlp.layers[2].register_forward_hook(record(f"{prefix}.mlp_contract"))
        )

    handles.append(model.lm_head.register_forward_hook(record("lm_head")))

    try:
        model.eval()
        with torch.no_grad():
            model(input_ids)
    finally:
        for handle in handles:
            handle.remove()

    return records


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run an untrained forward pass and print the tensor shape trace."
    )
    parser.add_argument("--config", required=True)
    parser.add_argument("--batch", type=int, default=2)
    parser.add_argument("--time", type=int, default=8)
    args = parser.parse_args()

    config = load_config(args.config)
    if args.batch < 1 or args.time < 1:
        raise ValueError("batch and time must be positive.")
    if args.time > config.block_size:
        raise ValueError("time cannot exceed the configured block_size.")

    text = Path(config.data_path).read_text(encoding="utf-8")
    tokenizer = CharTokenizer.from_text(text)
    model = TinyLanguageModel(
        ModelConfig(
            vocab_size=tokenizer.vocab_size,
            block_size=config.block_size,
            **config.model,
        )
    )
    input_ids = torch.arange(args.batch * args.time, dtype=torch.long)
    input_ids = input_ids.remainder(tokenizer.vocab_size).view(args.batch, args.time)

    print(
        f"B={args.batch} T={args.time} D={model.config.n_embd} "
        f"H={model.config.n_head} D_h={model.config.n_embd // model.config.n_head} "
        f"V={model.config.vocab_size}"
    )
    for label, shape in collect_shape_trace(model, input_ids):
        print(f"{label:30} {shape}")


if __name__ == "__main__":
    main()
