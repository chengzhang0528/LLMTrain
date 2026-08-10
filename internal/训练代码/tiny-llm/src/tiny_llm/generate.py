from __future__ import annotations

import argparse

import torch

from .checkpoint import load_checkpoint
from .runtime import choose_device, set_seed


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate text from a trained checkpoint.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--prompt", default="小")
    parser.add_argument("--tokens", type=int, default=160)
    parser.add_argument("--temperature", type=float, default=0.8)
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    set_seed(args.seed)
    device = choose_device(args.device)
    model, tokenizer, _ = load_checkpoint(args.checkpoint, device)
    prompt = torch.tensor(
        [tokenizer.encode(args.prompt)], dtype=torch.long, device=device
    )
    output = model.generate(
        prompt,
        max_new_tokens=args.tokens,
        temperature=args.temperature,
        top_k=args.top_k,
    )
    print(tokenizer.decode(output[0].tolist()))


if __name__ == "__main__":
    main()
