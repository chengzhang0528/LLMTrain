import unittest

import torch

from tiny_llm.model import ModelConfig, TinyLanguageModel


class TinyLanguageModelTests(unittest.TestCase):
    def setUp(self) -> None:
        torch.manual_seed(7)
        self.config = ModelConfig(
            vocab_size=11,
            block_size=8,
            n_layer=1,
            n_head=2,
            n_embd=8,
            dropout=0.0,
        )
        self.model = TinyLanguageModel(self.config)
        self.model.eval()

    def test_forward_shape_and_finite_loss(self) -> None:
        inputs = torch.randint(0, self.config.vocab_size, (2, 6))
        targets = torch.randint(0, self.config.vocab_size, (2, 6))
        logits, loss = self.model(inputs, targets)
        self.assertEqual(logits.shape, (2, 6, self.config.vocab_size))
        self.assertIsNotNone(loss)
        self.assertTrue(torch.isfinite(loss))

    def test_future_tokens_do_not_change_prefix_logits(self) -> None:
        first = torch.tensor([[1, 2, 3, 4, 5]])
        second = torch.tensor([[1, 2, 3, 8, 9]])
        first_logits, _ = self.model(first)
        second_logits, _ = self.model(second)
        self.assertTrue(torch.allclose(first_logits[:, :3], second_logits[:, :3]))

    def test_generation_appends_requested_tokens(self) -> None:
        prompt = torch.tensor([[1, 2]])
        output = self.model.generate(prompt, max_new_tokens=3, temperature=0)
        self.assertEqual(output.shape, (1, 5))

    def test_rejects_sequence_beyond_context_window(self) -> None:
        too_long = torch.ones((1, self.config.block_size + 1), dtype=torch.long)
        with self.assertRaises(ValueError):
            self.model(too_long)


if __name__ == "__main__":
    unittest.main()
