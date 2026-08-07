from __future__ import annotations

import json
import platform
import sys

import torch


def main() -> None:
    cuda_devices = []
    if torch.cuda.is_available():
        cuda_devices = [
            {
                "index": index,
                "name": torch.cuda.get_device_name(index),
                "memory_gib": round(
                    torch.cuda.get_device_properties(index).total_memory / 1024**3, 2
                ),
            }
            for index in range(torch.cuda.device_count())
        ]

    report = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "torch": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "cuda_devices": cuda_devices,
        "mps_available": bool(
            hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
        ),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
