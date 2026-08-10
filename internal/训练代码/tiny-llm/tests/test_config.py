import tempfile
import unittest
from pathlib import Path

from tiny_llm.config import load_config


class RunConfigTests(unittest.TestCase):
    def test_relative_paths_are_resolved_from_config_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "run.yaml"
            config_path.write_text(
                "data_path: data.txt\n"
                "output_dir: outputs\n"
                "max_steps: 2\n"
                "model:\n"
                "  n_layer: 1\n",
                encoding="utf-8",
            )
            config = load_config(config_path)
            self.assertEqual(Path(config.data_path), (root / "data.txt").resolve())
            self.assertEqual(Path(config.output_dir), (root / "outputs").resolve())
            self.assertEqual(config.model["n_layer"], 1)

    def test_unknown_key_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "run.yaml"
            config_path.write_text(
                "data_path: data.txt\noutput_dir: outputs\nmystery: 1\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                load_config(config_path)


if __name__ == "__main__":
    unittest.main()
