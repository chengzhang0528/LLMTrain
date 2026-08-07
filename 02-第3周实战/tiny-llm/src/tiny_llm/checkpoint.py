from __future__ import annotations

from pathlib import Path

import torch

from .model import ModelConfig, TinyLanguageModel
from .tokenizer import CharTokenizer


def load_checkpoint(
    path: str | Path, device: torch.device
) -> tuple[TinyLanguageModel, CharTokenizer, dict]:
    payload = torch.load(path, map_location=device, weights_only=True)
    model = TinyLanguageModel(ModelConfig(**payload["model_config"]))
    model.load_state_dict(payload["model_state"])
    model.to(device)
    model.eval()
    tokenizer = CharTokenizer(tokens=tuple(payload["tokenizer_tokens"]))
    return model, tokenizer, payload
