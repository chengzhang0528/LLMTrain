# DeepSeek-V2：MLA 与经济型 MoE

> 学习导航：V2 是理解后续 V3 的桥梁：MoE 负责容量/计算分离，MLA 负责压缩注意力缓存；“经济型”必须从训练、显存和服务三端同时看。

## 论文回答什么

长上下文推理的成本常被 KV Cache 限制，而 MoE 的专家通信又增加系统负担。V2 把 DeepSeekMoE 的细粒度专家与 Multi-head Latent Attention（MLA）组合起来，目标是提高总容量，同时减少每个 token 的激活和缓存压力。

```mermaid
flowchart LR
  A[输入 hidden state] --> B[MLA：压缩 K/V 潜变量]
  B --> C[注意力输出]
  C --> D[DeepSeekMoE：路由专家 + 共享专家]
  D --> E[残差与下一层]
  E --> F[KV Cache/专家通信账本]
```

## 核心机制

MLA 不等于“把所有历史压成一个向量”。它通过低维潜变量和投影保存注意力所需信息，具体缓存哪些张量要看实现。MoE 则把 FFN 计算路由到少数专家。两者相乘的收益依赖：MLA 缓存节省是否超过额外投影、专家通信是否被硬件隐藏、长上下文是否真的占主导。

## 训练与推理分开

训练时，MLA 投影、路由和并行布局要一起稳定；V2 的结果也包含数据、优化器与训练 token。推理时，MLA 主要影响 KV Cache 读写，MoE 主要影响专家 dispatch；一个优化不能代替另一个。vLLM 或其他引擎可以提供 MLA kernel，但是否使用取决于版本、精度和硬件。

## 数字证据账本

| 记录 | 口径 |
|---|---|
| 总/激活参数 | MoE 全部专家 vs 每 token 路由 |
| KV Cache 大小 | 每层维度、精度、batch、序列长度 |
| 长上下文延迟 | prefill 与 decode 分开 |
| 质量分数 | 同一提示、预算、工具和版本 |

教学复核：若每 token 的缓存从 $d=4096$ 个数压到 $d'=512$ 个数，单看 K/V 数量是 $512/4096=12.5\%$；实际显存还要乘层数、batch、精度，并加元数据和未压缩层。

## 代价与边界

- 压缩状态存在信息损失，精确复制远处细节的任务要单独测试。
- MLA kernel 不可用时，投影和缓存布局可能抵消理论收益。
- V2 的“经济”是特定硬件、上下文和并发下的系统结论，不是所有部署的常数。

## 本课验收

**L1 · 直接应用**：MLA 和 MoE 分别主要优化哪一项？

<details><summary>参考答案</summary>

MLA 主要压缩注意力的 K/V 状态与读写，MoE 主要分离总容量和每 token 的 FFN 计算；二者都需要系统配合。

</details>

**L2 · 变形迁移**：为什么只看参数量无法说明 V2 更省？

<details><summary>参考答案</summary>

成本还来自激活参数、KV Cache、专家通信、精度、上下文和 batch；参数量只是容量的一维指标。

</details>

**L3 · 构造反例**：什么负载下 MLA 的收益可能很小？

<details><summary>参考答案</summary>

短上下文、小 batch 或服务主要被网络/工具等待占据时，缓存压缩节省不是主要瓶颈，额外投影可能抵消收益。

</details>

**L4 · 多概念综合**：给一个“V2 更快”的宣传句补齐最少四个限定条件。

<details><summary>参考答案</summary>

要写清模型版本、上下文长度、batch/并发、硬件与 kernel、精度、prefill/decode 阶段和质量是否相当。

</details>

## 方法边界

V2 报告把多项改动组合在一起；本课中的缓存算例是教学推导，不是报告原表的复现。跨 V2/V3 比较必须保留数据、训练和服务条件。

来源：[DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model](https://arxiv.org/abs/2405.04434)。
