# D17：搭建微型 Transformer

## 按数据流读代码

1. `tokenizer.py`：字符与 ID 互转。
2. `data.py`：构造错开一位的输入与目标。
3. `model.py`：Embedding、因果注意力、MLP、残差、Norm 和 LM Head。
4. `train.py`：前向、反向、更新、验证和保存。

先运行测试，再改代码：

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

关键测试 `test_future_tokens_do_not_change_prefix_logits` 构造两个拥有相同前缀、不同后缀的序列。如果因果遮罩正确，前缀位置的 logits 不应因未来 token 改变。

## 形状练习

若 `batch=4, time=32, embedding=64, vocab=100`：

- token ID：`(4, 32)`
- 隐藏状态：`(4, 32, 64)`
- logits：`(4, 32, 100)`
- targets：`(4, 32)`
- 平均交叉熵：一个标量

## 今日验收

不用看代码，画出 `TinyLanguageModel.forward()` 的形状变化；再解释为什么 LM Head 最后一维必须等于词表大小。
