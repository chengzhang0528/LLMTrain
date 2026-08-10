from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CharTokenizer:
    """A deliberately simple character tokenizer for the first training project."""

    tokens: tuple[str, ...]

    @classmethod
    def from_text(cls, text: str) -> "CharTokenizer":
        if not text:
            raise ValueError("Cannot build a tokenizer from empty text.")
        return cls(tokens=("<unk>", *sorted(set(text))))

    @property
    def vocab_size(self) -> int:
        return len(self.tokens)

    @property
    def stoi(self) -> dict[str, int]:
        return {token: index for index, token in enumerate(self.tokens)}

    def encode(self, text: str) -> list[int]:
        lookup = self.stoi
        return [lookup.get(char, 0) for char in text]

    def decode(self, ids: list[int]) -> str:
        chars: list[str] = []
        for token_id in ids:
            if token_id < 0 or token_id >= self.vocab_size:
                raise ValueError(f"Token ID out of range: {token_id}")
            chars.append("�" if token_id == 0 else self.tokens[token_id])
        return "".join(chars)

    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps({"tokens": self.tokens}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: str | Path) -> "CharTokenizer":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(tokens=tuple(payload["tokens"]))
