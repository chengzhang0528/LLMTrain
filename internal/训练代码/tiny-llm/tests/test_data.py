import unittest

import torch

from tiny_llm.data import TextCorpus
from tiny_llm.tokenizer import CharTokenizer


class TextCorpusTests(unittest.TestCase):
    def test_targets_are_inputs_shifted_one_position(self) -> None:
        text = "甲乙丙丁戊己庚辛壬癸" * 20
        tokenizer = CharTokenizer.from_text(text)
        corpus = TextCorpus.from_text(text, tokenizer, block_size=4, train_fraction=0.8, seed=3)
        x, y = corpus.get_batch("train", batch_size=2, device=torch.device("cpu"))
        self.assertTrue(torch.equal(x[:, 1:], y[:, :-1]))


if __name__ == "__main__":
    unittest.main()
