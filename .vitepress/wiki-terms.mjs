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
  defineTerm("MoE", "moe", ["MoE", "混合专家"], "通过路由让每个 token 只激活部分专家子网络的架构。", "多个完整模型对同一答案投票。")
];

export const wikiAliases = wikiTerms.flatMap((term) =>
  term.aliases.map((alias) => ({ alias, term }))
);
