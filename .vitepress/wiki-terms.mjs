const glossaryBase = "/05-速查表/术语速查";

function defineTerm(term, anchor, aliases, summary, misconception) {
  return {
    term,
    anchor: `term-${anchor}`,
    aliases,
    summary,
    misconception,
    href: `${glossaryBase}#term-${anchor}`
  };
}

export const wikiTerms = [
  defineTerm("token", "token", ["token", "词元"], "文本经过分词规则得到的离散单元，随后会映射成整数 ID。", "token 必然等于一个字或一个完整单词。"),
  defineTerm("tokenizer", "tokenizer", ["tokenizer", "分词器"], "负责把文本切成 token，并在 token 与整数 ID 之间转换的规则和词表。", "tokenizer 是模型自己临时决定的切词方式。"),
  defineTerm("vocab", "vocab", ["vocab", "词表"], "tokenizer 可以表示的 token 集合；输出层通常也对这组 token 给出分数。", "词表包含了模型掌握的全部知识。"),
  defineTerm("parameter", "parameter", ["parameter", "parameters", "参数"], "模型中由训练确定的数字；训练时只有未冻结的参数会被更新。", "一个参数对应一条可直接读取的事实。"),
  defineTerm("embedding", "embedding", ["embedding", "embeddings", "词嵌入", "嵌入"], "把离散 ID 映射为连续向量的可训练表示。", "embedding 是人工指定的固定语义坐标。"),
  defineTerm("logits", "logits", ["logits", "logit"], "softmax 之前的任意实数分数，用来比较各候选 token。", "logits 已经是概率或正确率。"),
  defineTerm("softmax", "softmax", ["softmax"], "把一组分数转换为非负且总和为 1 的相对权重。", "softmax 会让模型答案自动真实或概率自动校准。"),
  defineTerm("loss", "loss", ["loss", "损失函数", "损失"], "训练目标对应的误差标量，优化器尝试让它下降。", "一个 loss 数值足以代表模型的全部质量。"),
  defineTerm("gradient", "gradient", ["gradient", "gradients", "梯度"], "loss 对各参数的局部变化率，指出当前附近怎样调整会改变 loss。", "梯度直接给出了全局最优答案。"),
  defineTerm("learning rate", "learning-rate", ["learning rate", "学习率"], "控制每次参数更新幅度的超参数。", "学习率越大，训练一定越快越好。"),
  defineTerm("optimizer", "optimizer", ["optimizer", "优化器"], "根据梯度及内部状态计算参数更新的算法，例如 AdamW。", "优化器负责计算前向预测或损失。"),
  defineTerm("batch", "batch", ["batch", "batches", "批次"], "一次前向与反向计算共同处理的一组样本。", "一个 batch 必然等于一次优化器更新或整个数据集。"),
  defineTerm("step", "step", ["step", "steps", "训练步"], "本课程默认指一次优化器更新；阅读日志时应先确认工具的定义。", "所有框架里的 step 都代表完全相同的事件。"),
  defineTerm("epoch", "epoch", ["epoch", "epochs", "轮次"], "训练过程大致遍历一遍训练集。", "一个 epoch 总有固定数量的 step。"),
  defineTerm("context", "context", ["context", "上下文"], "模型本次计算能够看到的 token 序列。", "放进上下文的信息已经永久写入模型参数。"),
  defineTerm("Transformer", "transformer", ["Transformer"], "由注意力、MLP、残差连接和归一化等模块组成的一类神经网络架构。", "所有大模型都只能采用同一种 Transformer 结构。"),
  defineTerm("attention", "attention", ["attention", "注意力机制", "注意力"], "根据 Query 与 Key 的匹配权重，对 Value 做加权汇总。", "注意力权重就是完整、可靠的人类可读解释。"),
  defineTerm("causal mask", "causal-mask", ["causal mask", "因果遮罩", "因果掩码"], "在自回归训练中阻止当前位置读取未来 token 的遮罩。", "它会阻止模型读取当前位置之前的内容。"),
  defineTerm("backpropagation", "backpropagation", ["backpropagation", "backprop", "反向传播"], "利用链式法则把输出误差逐层传回并计算梯度。", "反向传播本身就是优化器更新。"),
  defineTerm("cross-entropy", "cross-entropy", ["cross-entropy", "cross entropy", "交叉熵"], "衡量目标分布与预测分布差异的常用损失；分类时等价于正确类别的负对数概率。", "交叉熵就是准确率。"),
  defineTerm("checkpoint", "checkpoint", ["checkpoint", "checkpoints", "检查点"], "训练过程保存的权重及恢复训练所需状态快照。", "checkpoint 天然就是可直接上线的完整产品。"),
  defineTerm("pretraining", "pretraining", ["pretraining", "pre-training", "预训练"], "在大规模数据上学习通用模式的基础训练阶段。", "预训练数据越多，模型回答就必然越真实。"),
  defineTerm("SFT", "sft", ["SFT", "监督微调"], "用输入与理想输出示例进行监督训练，使模型更符合目标行为。", "SFT 会自动完成事实核验。"),
  defineTerm("LoRA", "lora", ["LoRA"], "冻结大部分基础权重，用低秩矩阵学习权重增量的参数高效微调方法。", "LoRA 会自动压缩推理模型或保证无损。"),
  defineTerm("QLoRA", "qlora", ["QLoRA"], "以低比特形式保存冻结的基础模型，同时训练 LoRA 适配器。", "LoRA 适配器本身被简单量化成 4 bit。"),
  defineTerm("RLHF", "rlhf", ["RLHF"], "利用人类偏好信号和强化学习优化模型行为的一类流程。", "所有对齐都只能通过 RLHF 完成。"),
  defineTerm("DPO", "dpo", ["DPO"], "直接利用偏好样本对优化策略，使偏好答案相对更可能。", "DPO 不包含任何偏好目标或参考约束。"),
  defineTerm("RAG", "rag", ["RAG", "检索增强生成"], "先检索外部资料，再把相关片段放进上下文辅助生成。", "检索到资料就能保证资料和答案都真实。"),
  defineTerm("Agent", "agent", ["Agent", "智能体"], "让模型参与工具选择、读取结果和多步决策循环的应用结构。", "Agent 可以脱离权限、预算和人工确认自主执行。"),
  defineTerm("inference", "inference", ["inference", "推理"], "使用训练好的参数，根据输入计算预测或生成结果。", "推理阶段通常会继续更新模型权重。"),
  defineTerm("overfitting", "overfitting", ["overfitting", "过拟合"], "模型继续改善训练数据表现，却不能同步改善未见数据表现的现象。", "训练 loss 下降就一定没有过拟合。"),
  defineTerm("validation set", "validation-set", ["validation set", "validation data", "验证数据", "验证集"], "不参与梯度更新、用于选择配置和观察泛化表现的数据。", "反复针对验证集调参不会产生信息泄漏。"),
  defineTerm("quantization", "quantization", ["quantization", "量化"], "用更低精度表示权重或激活，以换取更低内存和更高效率。", "量化总能四倍加速且完全没有质量变化。"),
  defineTerm("KV Cache", "kv-cache", ["KV Cache", "KV 缓存"], "自回归生成时缓存历史 token 的 Key/Value，避免每一步重复计算。", "KV Cache 主要用于降低训练显存。"),
  defineTerm("MoE", "moe", ["MoE", "混合专家"], "通过路由让每个 token 只激活部分专家子网络的架构。", "多个完整模型对同一答案投票。"),
  defineTerm("fixed-size state", "fixed-size-state", ["fixed-size state", "固定状态", "固定形状状态"], "用固定数量的数值递推压缩历史，而不是为每个 token 保留一份独立缓存。", "固定大小等于能无损记住无限历史。"),
  defineTerm("linear attention", "linear-attention", ["linear attention", "线性注意力"], "把注意力改写为可递推或可重排的状态计算，使部分成本对序列长度近似线性。", "所有线性注意力都无损等价于 softmax 注意力。"),
  defineTerm("outer product", "outer-product", ["outer product", "外积"], "把两个向量组合成矩阵，常用于把键方向与值内容写入状态。", "外积与得到单个标量的点积相同。"),
  defineTerm("quantile", "quantile", ["quantile", "quantiles", "分位数"], "按排序位置描述数据分布阈值的统计量；具体插值口径需明确。", "分位数在所有软件和样本规模下只有一种计算定义。"),
  defineTerm("softcap", "softcap", ["softcap", "平滑封顶"], "用平滑函数限制数值幅度，同时保留连续梯度。", "封顶后就自动没有溢出、稳定性或质量问题。"),
  defineTerm("total parameters", "total-parameters", ["total parameters", "总参数量"], "模型包含的全部可训练参数规模，包括稀疏 MoE 中未被当前 token 选择的专家。", "等于每个 token 实际经过的参数量。"),
  defineTerm("activated parameters", "activated-parameters", ["activated parameters", "激活参数", "激活参数量"], "稀疏模型一次 token 计算实际经过的参数规模口径。", "可以直接当作精确 FLOPs 或完整显存占用。"),
  defineTerm("Scaling Laws", "scaling-laws", ["Scaling Laws", "scaling law", "scaling laws", "缩放定律"], "在限定数据、模型与计算范围内观察到的经验缩放关系。", "参数翻倍就保证能力按固定比例增长。"),
  defineTerm("expert parallelism", "expert-parallelism", ["expert parallelism", "专家并行"], "把 MoE 专家分布到不同设备，并按路由交换 token 的并行方式。", "只减少计算而不会引入通信或负载不均。"),
  defineTerm("context parallelism", "context-parallelism", ["context parallelism", "上下文并行"], "把同一长序列的不同片段分到多个设备协同计算。", "与把不同样本分给设备的数据并行相同。"),
  defineTerm("prefix cache", "prefix-cache", ["prefix cache", "prefix caching", "前缀缓存"], "复用多个请求完全相同前缀已经计算出的中间状态。", "文本大致相似或权限不同也能直接复用。"),
  defineTerm("speculative decoding", "speculative-decoding", ["speculative decoding", "推测解码"], "由草稿模型提出候选，再由目标模型批量验证的解码优化。", "草稿模型可以绕过目标模型直接决定输出分布。"),
  defineTerm("reward hacking", "reward-hacking", ["reward hacking", "奖励投机"], "策略利用奖励或验证器漏洞拿到高分，却没有完成真实目标。", "分数提高就一定代表任务能力提高。"),
  defineTerm("agent harness", "agent-harness", ["agent harness"], "包围模型的系统提示、工具、执行循环、上下文管理与错误恢复机制。", "排行榜中的 Agent 成绩只反映基础模型权重。"),
  defineTerm("QAT", "qat", ["QAT", "quantization-aware training", "量化感知训练"], "训练时模拟目标低精度数值效果，使参数提前适应部署格式。", "所有组件都必须使用同一种低比特格式且不会掉点。"),
  defineTerm("native multimodal pretraining", "native-multimodal-pretraining", ["native multimodal pretraining", "原生多模态预训练", "原生多模态"], "在基础预训练阶段共同学习文本与其他模态表示，而非只在语言模型完成后外挂对齐。", "只要训练得早就自动优于所有后接视觉方案。"),
  defineTerm("KDA", "kda", ["KDA", "Kimi Delta Attention"], "Kimi K3 使用的门控 delta 状态更新注意力，以固定形状状态压缩历史。", "固定状态能无损替代所有全局注意力层。"),
  defineTerm("Gated MLA", "gated-mla", ["Gated MLA", "门控 MLA"], "Kimi K3 中带门控的多头潜在注意力，用于保留 token 级全局交互。", "与 KDA 的固定状态读写完全相同。"),
  defineTerm("AttnRes", "attnres", ["AttnRes", "Attention Residuals", "注意力残差"], "让当前层按学习到的权重读取多个历史层或块表示的深度连接。", "普通残差相加换了一个名称。"),
  defineTerm("Stable LatentMoE", "stable-latent-moe", ["Stable LatentMoE", "LatentMoE"], "在较窄潜空间中进行稀疏专家计算，并加入尺度稳定与负载均衡设计。", "总参数、激活参数、通信和显存都按同一比例下降。"),
  defineTerm("Quantile Balancing", "quantile-balancing", ["Quantile Balancing", "QB", "分位数均衡"], "按专家路由分数的分位位置更新选择偏置的负载均衡方法。", "一次更新就保证此后每个专家永远获得相同负载。"),
  defineTerm("MOPD", "mopd", ["MOPD", "Mixture-of-Policies Distillation"], "把多个领域与推理努力策略的行为蒸馏回一个学生模型的后训练方法。", "多个教师总能被无损合并成一个模型。")
];

export const wikiAliases = wikiTerms.flatMap((term) =>
  term.aliases.map((alias) => ({ alias, term }))
);
