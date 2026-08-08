import unittest

import torch

from tiny_llm.inspect_shapes import collect_shape_trace
from tiny_llm.model import ModelConfig, TinyLanguageModel


class ShapeTraceTests(unittest.TestCase):
    def test_collects_attention_and_mlp_shapes(self) -> None:
        model = TinyLanguageModel(
            ModelConfig(
                vocab_size=11,
                block_size=8,
                n_layer=1,
                n_head=2,
                n_embd=8,
                dropout=0.0,
            )
        )
        input_ids = torch.randint(0, 11, (2, 6))

        trace = dict(collect_shape_trace(model, input_ids))

        self.assertEqual(trace["input_ids"], (2, 6))
        self.assertEqual(trace["token_embedding"], (2, 6, 8))
        self.assertEqual(trace["block.0.qkv"], (2, 6, 24))
        self.assertEqual(trace["block.0.split_heads"], (2, 2, 6, 4))
        self.assertEqual(trace["block.0.attention_scores"], (2, 2, 6, 6))
        self.assertEqual(trace["block.0.mlp_expand"], (2, 6, 32))
        self.assertEqual(trace["block.0.mlp_contract"], (2, 6, 8))
        self.assertEqual(trace["lm_head"], (2, 6, 11))


if __name__ == "__main__":
    unittest.main()
