from __future__ import annotations

from dataclasses import dataclass

import torch

from .tokenizer import CharTokenizer


@dataclass
class TextCorpus:
    train_ids: torch.Tensor
    val_ids: torch.Tensor
    block_size: int
    seed: int

    @classmethod
    def from_text(
        cls,
        text: str,
        tokenizer: CharTokenizer,
        block_size: int,
        train_fraction: float,
        seed: int,
    ) -> "TextCorpus":
        ids = torch.tensor(tokenizer.encode(text), dtype=torch.long)
        split = int(len(ids) * train_fraction)
        train_ids, val_ids = ids[:split], ids[split:]
        minimum = block_size + 1
        if len(train_ids) < minimum or len(val_ids) < minimum:
            raise ValueError(
                f"Each split needs at least {minimum} tokens; "
                f"got train={len(train_ids)}, val={len(val_ids)}."
            )
        return cls(train_ids, val_ids, block_size, seed)

    def __post_init__(self) -> None:
        self._generators = {
            "train": torch.Generator().manual_seed(self.seed),
            "val": torch.Generator().manual_seed(self.seed + 1),
        }

    def get_batch(
        self, split: str, batch_size: int, device: torch.device
    ) -> tuple[torch.Tensor, torch.Tensor]:
        data = self.train_ids if split == "train" else self.val_ids
        starts = torch.randint(
            0,
            len(data) - self.block_size,
            (batch_size,),
            generator=self._generators[split],
        )
        x = torch.stack([data[i : i + self.block_size] for i in starts])
        y = torch.stack([data[i + 1 : i + self.block_size + 1] for i in starts])
        return x.to(device), y.to(device)
