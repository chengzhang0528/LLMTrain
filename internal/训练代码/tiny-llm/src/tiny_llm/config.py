from __future__ import annotations

from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

import yaml


@dataclass
class RunConfig:
    data_path: str
    output_dir: str
    seed: int = 42
    device: str = "auto"
    batch_size: int = 8
    block_size: int = 64
    max_steps: int = 100
    eval_interval: int = 20
    eval_iters: int = 10
    log_interval: int = 10
    learning_rate: float = 3e-4
    weight_decay: float = 0.1
    grad_clip: float = 1.0
    train_fraction: float = 0.9
    generate_prompt: str = "小"
    generate_tokens: int = 120
    temperature: float = 0.8
    top_k: int | None = 20
    overfit_one_batch: bool = False
    model: dict[str, Any] = field(default_factory=dict)


def load_config(path: str | Path) -> RunConfig:
    config_path = Path(path).resolve()
    payload = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Config root must be a mapping.")

    allowed = {item.name for item in fields(RunConfig)}
    unknown = sorted(set(payload) - allowed)
    if unknown:
        raise ValueError(f"Unknown config keys: {unknown}")

    config = RunConfig(**payload)
    base = config_path.parent
    config.data_path = str((base / config.data_path).resolve())
    config.output_dir = str((base / config.output_dir).resolve())

    if config.block_size < 2:
        raise ValueError("block_size must be at least 2.")
    if config.batch_size < 1 or config.max_steps < 1:
        raise ValueError("batch_size and max_steps must be positive.")
    if not 0.5 <= config.train_fraction < 1:
        raise ValueError("train_fraction must be in [0.5, 1).")
    return config
