import unittest

from tiny_llm.tokenizer import CharTokenizer


class CharTokenizerTests(unittest.TestCase):
    def test_known_text_round_trip(self) -> None:
        tokenizer = CharTokenizer.from_text("小模型")
        text = "模型小"
        self.assertEqual(tokenizer.decode(tokenizer.encode(text)), text)

    def test_unknown_character_uses_unknown_token(self) -> None:
        tokenizer = CharTokenizer.from_text("甲乙")
        self.assertEqual(tokenizer.encode("丙"), [0])
        self.assertEqual(tokenizer.decode([0]), "�")


if __name__ == "__main__":
    unittest.main()
