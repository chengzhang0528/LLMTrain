# 第 3 周：从零训练 tiny-llm

目标是完成一个可复现的 Decoder-only 字符语言模型训练闭环。它是教学模型，不是可用于真实业务的“小号 ChatGPT”。

## 环境安装

在本目录进入 `tiny-llm` 后执行。推荐 Python 3.10-3.13。

```powershell
cd tiny-llm
uv venv .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
.venv\Scripts\python.exe -m tiny_llm.inspect_env
```

没有 `uv` 时可用：

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

GPU 版本的 PyTorch 应按 [官方安装选择器](https://pytorch.org/get-started/locally/) 安装，不要盲目复制某个 CUDA 命令。

## 验证顺序

```powershell
# 1. 单元测试
.venv\Scripts\python.exe -m unittest discover -s tests -v

# 2. 未训练基线
.venv\Scripts\python.exe -m tiny_llm.baseline --config configs/smoke.yaml

# 3. 20 步冒烟训练
.venv\Scripts\python.exe -m tiny_llm.train --config configs/smoke.yaml

# 4. 单 batch 过拟合
.venv\Scripts\python.exe -m tiny_llm.train --config configs/overfit.yaml

# 5. CPU 正式实验
.venv\Scripts\python.exe -m tiny_llm.train --config configs/cpu.yaml
```

输出位于 `outputs/<实验名>/`。至少阅读 `metrics.jsonl`、`summary.json` 和 `sample.txt`，不要只看终端最后一句。

## 项目刻意简化的地方

- 使用字符 tokenizer，而非现代 LLM 常见的子词 tokenizer。
- 使用学习式绝对位置 Embedding，便于理解；不代表它是当前唯一或最优选择。
- 单机单进程训练，不包含混合精度和分布式。
- 小型演示语料用于跑通与观察过拟合，不代表通用语言能力数据。

每天任务见 D15-D21。模型实现见 `tiny-llm/src/tiny_llm/model.py`。
