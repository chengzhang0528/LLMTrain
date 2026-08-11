# 推理控制与服务行为

这条路线回答一个常见却容易被说玄的问题：同一个模型为什么有时像“认真思考”，有时像“降智”？答案通常不在一个神秘开关，而在模型版本、推理预算、候选搜索、工具循环、上下文处理、服务路由和部署精度共同组成的控制面。

## 先建立一张控制图

```text
用户任务
  ↓
模型/版本选择 → 思考开关与预算 → 候选、搜索、验证和工具循环
  ↓                    ↓                         ↓
上下文裁剪/压缩 → 前向与解码 → 输出、回退和服务交付
  ↓
质量、成本、延迟与安全评测 → 版本回归与再次调整
```

图中的箭头是诊断顺序，不表示每家厂商都使用相同组件。尤其要分清：`reasoning effort` 是模型相关的运行档位，可能影响思考 token、工具行为或回答长度；`temperature` 等解码参数改变候选选择分布；推理引擎负责执行和调度；路由器可能在请求到达时选择不同模型或配置。

## 推荐阅读顺序

| 顺序 | 单元 | 要解决的疑问 |
|---:|---|---|
| 1 | [推理深度与思考预算](01-推理深度与思考预算.md) | “认真一点”在厂商接口里究竟改变什么？ |
| 2 | [采样、搜索、验证器与工具循环](02-采样搜索验证器与工具循环.md) | 为什么多花推理计算有时有效，有时只是重复犯错？ |
| 3 | [模型路由、版本与服务策略](03-模型路由版本与服务策略.md) | 用户选的是一个名字，后台是否始终只有一个模型？ |
| 4 | [上下文压缩、记忆与长任务退化](04-上下文压缩记忆与长任务退化.md) | 为什么长对话会忘记中间内容，压缩又会带来什么损失？ |
| 5 | [部署精度与能力回归](05-部署精度与能力回归.md) | 量化、kernel、后训练和提示变更怎样让能力回退？ |
| 6 | [降智现象的归因与复现](06-降智现象归因与复现.md) | 如何从“感觉变差”走到可复现的证据？ |
| 7 | [质量、成本与延迟的对照账本](07-质量成本与延迟对照账本.md) | 厂商和应用怎样在三者之间选运行点？ |

## 本路线的证据口径

- **官方事实**：厂商公开文档或官方复盘明确写出的参数、默认值和行为。它们只适用于写明的模型、接口和版本。
- **论文结果**：论文作者在指定数据、模型、预算和评测协议下报告的实验，不自动代表所有任务。
- **教学示例**：为了练习归因而预生成的数字、日志或对照表，数字不是线上 benchmark。
- **课程推导**：根据前面证据整理出的诊断顺序，必须保留反例和不确定性。

课程不会要求调用 API、运行模型或训练模型。所有操作界面、日志和对照数字都是预先准备好的学习材料；学习目标是读懂控制项和证据，而不是替用户执行实验。

## 证据入口

- 厂商控制： [OpenAI reasoning guide](https://platform.openai.com/docs/guides/reasoning)、[Anthropic effort](https://docs.anthropic.com/en/docs/build-with-claude/effort)、[Anthropic extended thinking](https://docs.anthropic.com/en/docs/build-with-claude/thinking)、[Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking)、[DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode)、[Qwen3 官方仓库](https://github.com/QwenLM/Qwen3)。
- 推理时计算： [Scaling LLM Test-Time Compute Optimally](https://arxiv.org/abs/2408.03314)、[Large Language Monkeys](https://arxiv.org/abs/2407.21787)、[Self-Consistency](https://arxiv.org/abs/2203.11171)、[Tree of Thoughts](https://arxiv.org/abs/2305.10601)、[Let's Verify Step by Step](https://arxiv.org/abs/2305.20050)。
- 路由与成本： [RouteLLM](https://arxiv.org/abs/2406.18665)、[FrugalGPT](https://arxiv.org/abs/2305.05176)。
- 长上下文与部署： [Lost in the Middle](https://arxiv.org/abs/2307.03172)、[AWQ](https://arxiv.org/abs/2306.00978)、[OpenAI 的 GPT-4o 行为回归复盘](https://openai.com/index/sycophancy-in-gpt-4o/)。

前置：[模型一次运行到底发生什么](../../01-14天理论课/D07-模型一次运行到底发生什么.md) · [上线后如何发现并修正问题](../../01-14天理论课/D14-监控、反馈与持续迭代.md)

返回：[拓展知识库](../)
