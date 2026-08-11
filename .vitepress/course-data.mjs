export const courseLessons = [
  { day: 1, phase: "理论", mainline: "模型原理", title: "大模型到底是什么", source: "01-14天理论课/D01-大模型到底是什么.md", href: "/01-14天理论课/D01-大模型到底是什么" },
  { day: 2, phase: "理论", mainline: "模型原理", title: "文字如何变成数字", source: "01-14天理论课/D02-文字如何变成数字.md", href: "/01-14天理论课/D02-文字如何变成数字" },
  { day: 3, phase: "理论", mainline: "模型原理", title: "够用就好的数学基础", source: "01-14天理论课/D03-够用就好的数学基础.md", href: "/01-14天理论课/D03-够用就好的数学基础" },
  { day: 4, phase: "理论", mainline: "模型原理", title: "神经网络如何学习", source: "01-14天理论课/D04-神经网络如何学习.md", href: "/01-14天理论课/D04-神经网络如何学习" },
  { day: 5, phase: "理论", mainline: "模型架构与运行", title: "注意力机制", source: "01-14天理论课/D05-注意力机制.md", href: "/01-14天理论课/D05-注意力机制" },
  { day: 6, phase: "理论", mainline: "模型架构与运行", title: "拼出完整 Transformer", source: "01-14天理论课/D06-拼出完整Transformer.md", href: "/01-14天理论课/D06-拼出完整Transformer" },
  { day: 7, phase: "理论", mainline: "模型架构与运行", title: "模型一次运行到底发生什么", source: "01-14天理论课/D07-模型一次运行到底发生什么.md", href: "/01-14天理论课/D07-模型一次运行到底发生什么" },
  { day: 8, phase: "理论", mainline: "数据准备与模型训练", title: "从原始文本到训练样本", source: "01-14天理论课/D08-训练数据与分词器.md", href: "/01-14天理论课/D08-训练数据与分词器" },
  { day: 9, phase: "理论", mainline: "数据准备与模型训练", title: "一个训练 Step 如何推动整次任务", source: "01-14天理论课/D09-训练任务内部的一次完整循环.md", href: "/01-14天理论课/D09-训练任务内部的一次完整循环" },
  { day: 10, phase: "理论", mainline: "数据准备与模型训练", title: "把训练放大：算力、显存与并行", source: "01-14天理论课/D10-预训练与规模化训练.md", href: "/01-14天理论课/D10-预训练与规模化训练" },
  { day: 11, phase: "理论", mainline: "模型评估与优化", title: "让基座适应任务：SFT、LoRA 与 QLoRA", source: "01-14天理论课/D11-SFT、LoRA与QLoRA.md", href: "/01-14天理论课/D11-SFT、LoRA与QLoRA" },
  { day: 12, phase: "理论", mainline: "模型评估与优化", title: "让行为可控，让改进可测", source: "01-14天理论课/D12-对齐、强化学习与评测.md", href: "/01-14天理论课/D12-对齐、强化学习与评测" },
  { day: 13, phase: "理论", mainline: "推理、部署与应用", title: "模型如何成为可用系统", source: "01-14天理论课/D13-推理、部署、RAG与Agent.md", href: "/01-14天理论课/D13-推理、部署、RAG与Agent" },
  { day: 14, phase: "理论", mainline: "监控、反馈与迭代", title: "上线后如何发现并修正问题", source: "01-14天理论课/D14-监控、反馈与持续迭代.md", href: "/01-14天理论课/D14-监控、反馈与持续迭代" },
  { day: 15, phase: "案例", title: "先固定起点：未训练基线", source: "02-第3周实战/D15-确定目标与跑通基线.md", href: "/02-第3周实战/D15-确定目标与跑通基线" },
  { day: 16, phase: "案例", title: "数据边界决定结论边界", source: "02-第3周实战/D16-准备和检查数据.md", href: "/02-第3周实战/D16-准备和检查数据" },
  { day: 17, phase: "案例", title: "跟着张量走过 Transformer", source: "02-第3周实战/D17-搭建微型Transformer.md", href: "/02-第3周实战/D17-搭建微型Transformer" },
  { day: 18, phase: "案例", title: "用单 Batch 过拟合定位训练故障", source: "02-第3周实战/D18-单批次过拟合与排错.md", href: "/02-第3周实战/D18-单批次过拟合与排错" },
  { day: 19, phase: "案例", title: "从曲线中选择可恢复检查点", source: "02-第3周实战/D19-正式训练与保存检查点.md", href: "/02-第3周实战/D19-正式训练与保存检查点" },
  { day: 20, phase: "案例", title: "怎样做一次可信的模型对照", source: "02-第3周实战/D20-评测、生成与对照实验.md", href: "/02-第3周实战/D20-评测、生成与对照实验" },
  { day: 21, phase: "案例", title: "用模型卡守住结论边界", source: "02-第3周实战/D21-模型卡、复现与成果验收.md", href: "/02-第3周实战/D21-模型卡、复现与成果验收" }
];

export const legacyLessonAliases = [
  {
    oldSource: "01-14天理论课/D07-模型如何生成文字.md",
    source: "01-14天理论课/D07-模型一次运行到底发生什么.md",
    oldHref: "/01-14天理论课/D07-模型如何生成文字",
    href: "/01-14天理论课/D07-模型一次运行到底发生什么"
  },
  {
    oldSource: "01-14天理论课/D09-一次完整训练循环.md",
    source: "01-14天理论课/D09-训练任务内部的一次完整循环.md",
    oldHref: "/01-14天理论课/D09-一次完整训练循环",
    href: "/01-14天理论课/D09-训练任务内部的一次完整循环"
  },
  {
    oldSource: "01-14天理论课/D14-多模态、应用全景与总复习.md",
    source: "01-14天理论课/D14-监控、反馈与持续迭代.md",
    oldHref: "/01-14天理论课/D14-多模态、应用全景与总复习",
    href: "/01-14天理论课/D14-监控、反馈与持续迭代"
  }
];

export const topicCourses = [
  {
    text: "幻觉与可靠性",
    base: "/06-拓展知识库/幻觉与可靠性",
    sourceBase: "06-拓展知识库/幻觉与可靠性",
    lessons: [
      ["生成为什么不保证事实", "01-生成为什么不保证事实"],
      ["幻觉归因与失败分层", "02-幻觉归因与失败分层"],
      ["事实性、忠实度与校准", "03-事实性忠实度与校准"],
      ["RAG、拒答、验证器与治理", "04-RAG拒答验证器与治理"],
      ["可靠性评测案例", "05-可靠性评测项目"]
    ]
  },
  {
    text: "模型后训练",
    base: "/06-拓展知识库/模型后训练",
    sourceBase: "06-拓展知识库/模型后训练",
    lessons: [
      ["基座审计与任务边界", "01-基座审计与任务边界"],
      ["SFT 数据与训练方案", "02-SFT数据与训练方案"],
      ["偏好优化与可验证奖励", "03-偏好优化与可验证奖励"],
      ["回归、校准与安全", "04-回归校准与安全"],
      ["领域助手后训练案例", "05-领域助手后训练项目"]
    ]
  },
  {
    text: "实际模型案例",
    base: "/06-拓展知识库/实际模型项目",
    sourceBase: "06-拓展知识库/实际模型项目",
    lessons: [
      ["问题合同与两套评测集", "01-问题合同与冻结验收集"],
      ["基线阶梯与方法选择", "02-基线阶梯与方法选择"],
      ["数据、模型与系统联合设计", "03-数据模型系统联合设计"],
      ["质量、性能与安全验收", "04-质量性能与安全验收"],
      ["项目档案、里程碑与复现", "05-项目提案里程碑与复现"]
    ]
  },
  {
    text: "模型评测与选型",
    base: "/06-拓展知识库/模型评测与选型",
    sourceBase: "06-拓展知识库/模型评测与选型",
    lessons: [
      ["最新榜单总览", "01-先定义模型选择合同"],
      ["按能力分类的榜单", "02-把评分指标翻成大白话"],
      ["各机构榜单目录", "03-判断榜单与结论有多可信"],
      ["代码与 Agent 榜单", "04-按应用场景建立候选池"],
      ["开放权重榜单", "05-2026-08开放权重模型现状"],
      ["Embedding、OCR、ASR 与安全", "06-不只选择生成模型"],
      ["从公开榜单到本地验收", "07-从公开榜单到本地验收"]
    ]
  },
  {
    text: "多模态基础",
    base: "/06-拓展知识库/多模态基础",
    sourceBase: "06-拓展知识库/多模态基础",
    lessons: [
      ["从模态到张量", "01-从模态到张量"],
      ["连接器与跨模态对齐", "02-连接器与跨模态对齐"],
      ["多模态训练路线", "03-多模态训练路线"],
      ["分层评测与失败定位", "04-分层评测与失败定位"],
      ["图文故障单案例", "05-图文故障单项目"]
    ]
  },
  {
    text: "软硬件瓶颈",
    base: "/06-拓展知识库/软硬件瓶颈",
    sourceBase: "06-拓展知识库/软硬件瓶颈",
    lessons: [
      ["AI Infra 全栈责任地图", "00-AI-Infra全栈责任地图"],
      ["指标与容量账本", "01-指标与容量账本"],
      ["计算、带宽与内存墙", "02-计算带宽与内存墙"],
      ["推理引擎与解码执行", "03-推理引擎与解码执行"],
      ["并行、通信与集群", "04-并行通信与集群"],
      ["服务性能对照案例", "05-服务性能对照项目"],
      ["Token 生成速度与并行解码", "06-Token生成速度与并行解码"]
    ]
  },
  {
    text: "推理控制与服务行为",
    base: "/06-拓展知识库/推理控制与服务行为",
    sourceBase: "06-拓展知识库/推理控制与服务行为",
    lessons: [
      ["推理深度与思考预算", "01-推理深度与思考预算"],
      ["采样、搜索、验证器与工具循环", "02-采样搜索验证器与工具循环"],
      ["模型路由、版本与服务策略", "03-模型路由版本与服务策略"],
      ["上下文压缩、记忆与长任务退化", "04-上下文压缩记忆与长任务退化"],
      ["部署精度与能力回归", "05-部署精度与能力回归"],
      ["降智现象的归因与复现", "06-降智现象归因与复现"],
      ["质量、成本与延迟的对照账本", "07-质量成本与延迟对照账本"]
    ]
  }
];

export const topicLessons = topicCourses.flatMap((course) =>
  course.lessons.map(([title, slug]) => ({
    course: course.text,
    title,
    source: `${course.sourceBase}/${slug}.md`,
    href: `${course.base}/${slug}`
  }))
);

export const smallModelLessons = [
  ["从问题到小模型", "01-从问题到小模型"],
  ["训练一个可用的小模型", "02-训练一个可用的小模型"],
  ["模型蒸馏", "03-模型蒸馏"],
  ["压缩、部署与对照实验", "04-压缩部署与对照实验"]
].map(([title, slug]) => ({
  track: "小模型与蒸馏",
  title,
  source: `06-拓展知识库/小模型与蒸馏/${slug}.md`,
  href: `/06-拓展知识库/小模型与蒸馏/${slug}`
}));

const kimiK3ChapterSpecs = [
  ["三维信息流", "01-三维信息流全景"],
  ["KDA 与混合注意力", "02-KDA与混合注意力"],
  ["AttnRes 与 LatentMoE", "03-AttnRes与Stable-LatentMoE"],
  ["预训练与多模态", "04-预训练长上下文与原生多模态"],
  ["后训练与可验证 RL", "05-后训练与可验证RL"],
  ["基础设施与评测", "06-基础设施与评测"]
];

export const kimiK3ChapterLessons = kimiK3ChapterSpecs.map(([title, slug]) => ({
  track: "论文研读",
  title: `Kimi K3 · ${title}`,
  source: `06-拓展知识库/论文研读/Kimi深读/06-Kimi-K3技术报告/${slug}.md`,
  href: `/06-拓展知识库/论文研读/Kimi深读/06-Kimi-K3技术报告/${slug}`
}));

export const paperSurveyLessons = [
  ["如何读懂一篇论文", "03-如何读懂一篇论文"],
  ["论文知识图谱", "02-跨系列问题地图"],
  ["论文材料库与学习进度", "01-论文库"],
  ["GLM 系列演进", "04-GLM系列演进"],
  ["Kimi 系列演进", "05-Kimi系列演进"],
  ["DeepSeek 系列演进", "06-DeepSeek系列演进"],
  ["Qwen 系列演进", "07-Qwen系列演进"]
].map(([title, slug]) => ({
  track: "论文研读",
  title,
  source: `06-拓展知识库/论文研读/${slug}.md`,
  href: `/06-拓展知识库/论文研读/${slug}`
}));

export const seriesPaperCourses = [
  {
    text: "GLM 论文深读",
    base: "/06-拓展知识库/论文研读/GLM深读",
    overview: "/06-拓展知识库/论文研读/04-GLM系列演进",
    sourceBase: "06-拓展知识库/论文研读/GLM深读",
    lessons: [
      ["GLM：生成式预训练的空白填充", "01-GLM预训练目标", "glm-foundation"],
      ["GLM-130B：开放规模化训练", "02-GLM-130B规模化", "glm-130b"],
      ["ChatGLM：从基座到可用对话", "03-ChatGLM对话对齐", "chatglm-family"],
      ["GLM-4.5：通用模型变成智能体", "04-GLM-4.5智能体", "glm-45"],
      ["GLM-5：长任务与稀疏注意力", "05-GLM-5长任务", "glm-5"]
    ]
  },
  {
    text: "Kimi 论文深读",
    base: "/06-拓展知识库/论文研读/Kimi深读",
    overview: "/06-拓展知识库/论文研读/05-Kimi系列演进",
    sourceBase: "06-拓展知识库/论文研读/Kimi深读",
    lessons: [
      ["Kimi k1.5：长思维链强化学习", "01-k1.5长思维链强化学习", "kimi-k15"],
      ["MoBA：可组合的块稀疏注意力", "02-MoBA稀疏注意力", "moba"],
      ["Kimi K2：原生 Agent 基座", "03-Kimi-K2原生Agent", "kimi-k2"],
      ["Kimi Linear：混合注意力", "04-Kimi-Linear混合注意力", "kimi-linear"],
      ["Kimi K2.5：原生多模态与 Agent Swarm", "05-Kimi-K2.5原生多模态", "kimi-k25"],
      ["Kimi K3：完整技术报告", "06-Kimi-K3技术报告", "kimi-k3"]
    ]
  },
  {
    text: "DeepSeek 论文深读",
    base: "/06-拓展知识库/论文研读/DeepSeek深读",
    overview: "/06-拓展知识库/论文研读/06-DeepSeek系列演进",
    sourceBase: "06-拓展知识库/论文研读/DeepSeek深读",
    lessons: [
      ["DeepSeek LLM：开放基座的训练账本", "01-DeepSeek-LLM基础模型", "deepseek-llm"],
      ["DeepSeekMoE：专家如何专门化", "02-DeepSeekMoE专家路由", "deepseek-moe"],
      ["DeepSeek-V2：MLA 与经济型 MoE", "03-DeepSeek-V2-MoE与MLA", "deepseek-v2"],
      ["DeepSeek-V3：规模化训练系统", "04-DeepSeek-V3规模化训练", "deepseek-v3"],
      ["DeepSeek-R1：推理能力的强化学习", "05-DeepSeek-R1推理强化学习", "deepseek-r1"],
      ["Janus：理解与生成的视觉分工", "06-Janus统一视觉生成", "janus"]
    ]
  },
  {
    text: "Qwen 论文深读",
    base: "/06-拓展知识库/论文研读/Qwen深读",
    overview: "/06-拓展知识库/论文研读/07-Qwen系列演进",
    sourceBase: "06-拓展知识库/论文研读/Qwen深读",
    lessons: [
      ["Qwen：多语言通用基座起点", "01-Qwen基础模型", "qwen"],
      ["Qwen2.5：通用主干的训练与后训练", "02-Qwen2.5通用主干", "qwen25"],
      ["Qwen2-VL：任意分辨率的视觉输入", "03-Qwen2-VL视觉编码", "qwen2-vl"],
      ["Qwen2.5-Coder：代码领域继续训练", "04-Qwen2.5-Coder代码模型", "qwen25-coder"],
      ["Qwen3：思考模式与推理后训练", "05-Qwen3思考模式与推理", "qwen3"],
      ["Qwen2.5-Omni：端到端多模态交互", "06-Qwen2.5-Omni原生多模态", "qwen25-omni"]
    ]
  }
];

export const seriesPaperLessons = seriesPaperCourses.flatMap((course) =>
  course.lessons.map(([title, slug, paperId]) => ({
    track: course.text,
    title,
    source: `${course.sourceBase}/${slug}.md`,
    href: `${course.base}/${slug}`,
    paperId
  }))
);

export const opdPaperLessons = [
  ["教师越强越好吗", "01-教师越强越好吗"],
  ["学生访问状态与重叠 token", "02-学生访问状态与重叠token"],
  ["冷启动、提示对齐与长轨迹", "03-冷启动提示对齐与长轨迹边界"]
].map(([title, slug]) => ({
  track: "论文研读",
  title: `在策略蒸馏 · ${title}`,
  source: `06-拓展知识库/在策略蒸馏深读/${slug}.md`,
  href: `/06-拓展知识库/在策略蒸馏深读/${slug}`
}));

const mathSupportLessons = [
  ["数、比例与平均数", "01-数、比例与平均数"],
  ["向量、矩阵与点积", "02-向量、矩阵与点积"],
  ["概率与 softmax", "03-概率与softmax"],
  ["导数、梯度与学习率", "04-导数、梯度与学习率"],
  ["对数与交叉熵", "05-对数与交叉熵"],
  ["外积与状态矩阵", "06-外积与状态矩阵"],
  ["分位数与平滑封顶", "07-分位数与平滑封顶"],
  ["高维表示、投影与降维", "08-高维表示、投影与降维"]
].map(([title, slug]) => ({
  track: "学习辅助（按需）",
  title,
  source: `03-数学急救包/${slug}.md`,
  href: `/03-数学急救包/${slug}`,
  optional: true
}));

const visualSupportLessons = [
  ["动画模型实验室", "动画模型实验室"],
  ["注意力：三张便签", "注意力-三张便签"],
  ["梯度下降：旋钮下山", "梯度下降-旋钮下山"],
  ["训练、验证与测试：三套题", "训练与验证-两套题"]
].map(([title, slug]) => ({
  track: "学习辅助（按需）",
  title,
  source: `04-图解与数字漫画/${slug}.md`,
  href: `/04-图解与数字漫画/${slug}`,
  optional: true
}));

export const algorithmLessons = [
  ["BPE 分词", "01-BPE分词"],
  ["自注意力", "02-自注意力"],
  ["反向传播", "03-反向传播"],
  ["梯度下降", "04-梯度下降"],
  ["AdamW 优化器", "05-AdamW优化器"],
  ["MoE 专家路由", "06-MoE专家路由"],
  ["LoRA 低秩适配", "07-LoRA低秩适配"],
  ["DPO 偏好优化", "08-DPO偏好优化"],
  ["GRPO 组相对策略优化", "09-GRPO组相对策略优化"],
  ["知识蒸馏", "10-知识蒸馏"],
  ["模型量化", "11-模型量化"],
  ["模型剪枝", "12-模型剪枝"],
  ["采样解码", "13-采样解码"],
  ["推测解码", "14-推测解码"],
  ["神经网络与 MLP", "15-神经网络与MLP"],
  ["卷积神经网络 CNN", "16-卷积神经网络CNN"],
  ["循环神经网络 RNN", "17-循环神经网络RNN"],
  ["LSTM 长短期记忆网络", "18-LSTM长短期记忆网络"],
  ["GRU 门控循环单元", "19-GRU门控循环单元"],
  ["Transformer 架构", "20-Transformer架构"],
  ["自编码器", "21-自编码器"],
  ["生成对抗网络 GAN", "22-生成对抗网络GAN"],
  ["扩散模型", "23-扩散模型"],
  ["图神经网络 GNN", "24-图神经网络GNN"]
].map(([title, slug]) => ({
  track: "模型算法图解",
  title,
  source: `09-模型算法图解/${slug}.md`,
  href: `/09-模型算法图解/${slug}`,
  optional: true
}));

function topicUnits(name) {
  return topicLessons
    .filter((lesson) => lesson.course === name)
    .map((lesson) => ({ ...lesson, track: lesson.course }));
}

export const learningUnits = [
  ...courseLessons.map((lesson) => ({
    ...lesson,
    code: `D${String(lesson.day).padStart(2, "0")}`,
    track: lesson.phase === "理论" ? "理论基础" : "训练过程案例"
  })),
  ...topicUnits("实际模型案例"),
  ...topicUnits("模型评测与选型"),
  ...topicUnits("模型后训练"),
  ...topicUnits("幻觉与可靠性"),
  ...smallModelLessons,
  ...topicUnits("多模态基础"),
  ...topicUnits("软硬件瓶颈"),
  ...topicUnits("推理控制与服务行为"),
  {
    track: "前沿与瓶颈",
    title: "前沿瓶颈地图",
    source: "06-拓展知识库/前沿瓶颈地图.md",
    href: "/06-拓展知识库/前沿瓶颈地图"
  },
  {
    track: "论文研读",
    title: "论文研读入口",
    source: "06-拓展知识库/论文研读/README.md",
    href: "/06-拓展知识库/论文研读/"
  },
  ...paperSurveyLessons,
  ...seriesPaperLessons,
  ...kimiK3ChapterLessons,
  ...opdPaperLessons,
  ...mathSupportLessons,
  ...visualSupportLessons,
  ...algorithmLessons
].map((unit, index) => ({
  recommended: !unit.optional,
  ...unit,
  order: index + 1
}));

export const recommendedLearningUnits = learningUnits.filter((unit) => unit.recommended);

const startSidebarItems = [
  ["课程首页", "/"],
  ["从这里开始", "/00-从这里开始/"],
  ["零基础默认路线", "/00-从这里开始/基础闭环路线"],
  ["学前自测（可跳过）", "/00-从这里开始/学前自测"],
  ["按目标选择路线", "/00-从这里开始/能力路线"],
  ["按问题寻找入口", "/00-从这里开始/学科地图"],
  ["全局知识图谱", "/00-从这里开始/全局知识图谱"],
  ["课程为什么这样安排", "/00-从这里开始/课程为什么这样安排"],
  ["学习记录与复习", "/00-从这里开始/学习记录与复习"],
  ["运行环境与硬件（按需）", "/00-从这里开始/环境与硬件选择"],
  ["学习目标与边界", "/00-从这里开始/学习目标与边界"]
];

const algorithmGroup = {
  text: "模型算法图解",
  collapsed: true,
  items: [
    ["算法地图", "/09-模型算法图解/"],
    ...algorithmLessons.map((lesson) => [lesson.title, lesson.href])
  ]
};

const mathSupportGroup = {
  text: "数学急救包",
  collapsed: false,
  items: [
    ["使用说明", "/03-数学急救包/"],
    ...mathSupportLessons.map((lesson) => [lesson.title, lesson.href])
  ]
};

const visualSupportGroup = {
  text: "图解与动画",
  collapsed: false,
  items: [
    ["图解目录", "/04-图解与数字漫画/"],
    ...visualSupportLessons.map((lesson) => [lesson.title, lesson.href])
  ]
};

const smallModelGroup = {
  text: "小模型与蒸馏",
  collapsed: false,
  items: [
    ["路线说明", "/06-拓展知识库/小模型与蒸馏/"],
    ["从问题到小模型", "/06-拓展知识库/小模型与蒸馏/01-从问题到小模型"],
    ["训练一个可用的小模型", "/06-拓展知识库/小模型与蒸馏/02-训练一个可用的小模型"],
    ["模型蒸馏", "/06-拓展知识库/小模型与蒸馏/03-模型蒸馏"],
    ["压缩、部署与对照实验", "/06-拓展知识库/小模型与蒸馏/04-压缩部署与对照实验"]
  ]
};

const researchQuestionItems = [
  ["预训练目标与数据", "/06-拓展知识库/论文研读/02-跨系列问题地图#预训练目标与数据"],
  ["模型容量与计算效率", "/06-拓展知识库/论文研读/02-跨系列问题地图#模型容量与计算效率"],
  ["长上下文与注意力", "/06-拓展知识库/论文研读/02-跨系列问题地图#长上下文与注意力"],
  ["推理与后训练", "/06-拓展知识库/论文研读/02-跨系列问题地图#推理与后训练"],
  ["多模态输入与生成", "/06-拓展知识库/论文研读/02-跨系列问题地图#多模态输入与生成"],
  ["Agent、系统与可靠性", "/06-拓展知识库/论文研读/02-跨系列问题地图#agent、系统与可靠性"]
];

const crossSeriesPaperItems = [
  ["在策略蒸馏论文路线", "/06-拓展知识库/在策略蒸馏深读/"],
  ...opdPaperLessons.map((lesson) => [lesson.title.replace("在策略蒸馏 · ", ""), lesson.href])
];

const inPolicyDistillationGroup = {
  text: "在策略蒸馏",
  collapsed: false,
  items: crossSeriesPaperItems
};

const referenceGroup = {
  text: "速查表",
  collapsed: false,
  items: [
    ["术语速查", "/05-速查表/术语速查"],
    ["公式速查", "/05-速查表/公式速查"],
    ["方法选择", "/05-速查表/方法选择"],
    ["训练排错", "/05-速查表/训练排错"]
  ]
};

export const primaryNav = [
  {
    text: "开始",
    items: [
      { text: "课程入口", link: "/00-从这里开始/" },
      { text: "学科地图", link: "/00-从这里开始/学科地图" },
      { text: "知识图谱", link: "/00-从这里开始/全局知识图谱" },
      { text: "能力路线", link: "/00-从这里开始/能力路线" }
    ]
  },
  {
    text: "基础课程",
    items: [
      { text: "理论基础", link: "/01-14天理论课/" },
      { text: "训练过程案例", link: "/02-第3周实战/" },
      { text: "模型算法图解", link: "/09-模型算法图解/" }
    ]
  },
  { text: "专题课程", link: "/06-拓展知识库/" },
  { text: "论文研读", link: "/06-拓展知识库/论文研读/" },
  {
    text: "查阅工具",
    items: [
      { text: "方法选择", link: "/05-速查表/方法选择" },
      { text: "术语速查", link: "/05-速查表/术语速查" },
      { text: "公式速查", link: "/05-速查表/公式速查" },
      { text: "数学急救包", link: "/03-数学急救包/" },
      { text: "图解与动画", link: "/04-图解与数字漫画/" }
    ]
  }
];

function links(items) {
  return items.map((item) => {
    if (Array.isArray(item)) return { text: item[0], link: item[1] };
    return item.items ? { ...item, items: links(item.items) } : item;
  });
}

function topicCourseGroup(name) {
  const course = topicCourses.find((item) => item.text === name);
  if (!course) throw new Error(`缺少专题课程：${name}`);
  return {
    text: course.text,
    collapsed: false,
    items: [
      ["路线说明", `${course.base}/`],
      ...course.lessons.map(([title, slug]) => [title, `${course.base}/${slug}`])
    ]
  };
}

function lessonItem(lesson) {
  return {
    text: `D${String(lesson.day).padStart(2, "0")} · ${lesson.title}`,
    link: lesson.href
  };
}

function theoryMainlineGroup(text, overview) {
  return {
    text,
    collapsed: true,
    items: [
      ...(overview ? [{ text: "本组总纲", link: overview }] : []),
      ...courseLessons.filter((lesson) => lesson.mainline === text).map(lessonItem)
    ]
  };
}

const theoryGroup = {
  text: "理论基础",
  collapsed: false,
  items: [
    { text: "课程说明", link: "/01-14天理论课/" },
    { text: "模型全生命周期总览", link: "/01-14天理论课/模型训练总纲" },
    theoryMainlineGroup("模型原理", "/01-14天理论课/模型原理总纲"),
    theoryMainlineGroup("模型架构与运行", "/01-14天理论课/模型架构总纲"),
    theoryMainlineGroup("数据准备与模型训练"),
    theoryMainlineGroup("模型评估与优化"),
    theoryMainlineGroup("推理、部署与应用"),
    theoryMainlineGroup("监控、反馈与迭代")
  ]
};

const trainingCaseGroup = {
  text: "训练过程案例",
  collapsed: false,
  items: [
    { text: "案例说明", link: "/02-第3周实战/" },
    ...courseLessons.filter((lesson) => lesson.phase === "案例").flatMap((lesson) => [
      lessonItem(lesson),
      ...(lesson.day === 16
        ? [{ text: "数据卡审查框架", link: "/02-第3周实战/数据卡模板" }]
        : []),
      ...(lesson.day === 21
        ? [{ text: "模型卡审查框架", link: "/02-第3周实战/模型卡模板" }]
        : [])
    ])
  ]
};

function seriesPaperGroup(course) {
  return {
    text: course.text,
    collapsed: false,
    items: links([
      ["系列首页", `${course.base}/`],
      ["推荐阅读顺序", course.overview],
      ["完整材料目录", `${course.base}/论文`],
      ...course.lessons.map(([title, slug, paperId]) => paperId === "kimi-k3"
        ? {
            text: title,
            collapsed: true,
            items: [
              ["论文总览", `${course.base}/${slug}`],
              ...kimiK3ChapterSpecs.map(([chapterTitle, chapterSlug]) => [
                chapterTitle,
                `${course.base}/06-Kimi-K3技术报告/${chapterSlug}`
              ])
            ]
          }
        : [title, `${course.base}/${slug}`])
    ])
  };
}

function collapsedSidebarGroup(group) {
  return { ...group, collapsed: true, items: links(group.items) };
}

const topicSidebarGroups = [
  topicCourseGroup("实际模型案例"),
  topicCourseGroup("模型评测与选型"),
  topicCourseGroup("模型后训练"),
  smallModelGroup,
  topicCourseGroup("多模态基础"),
  topicCourseGroup("幻觉与可靠性"),
  topicCourseGroup("推理控制与服务行为"),
  topicCourseGroup("软硬件瓶颈"),
  inPolicyDistillationGroup
].map(collapsedSidebarGroup);

export const sidebar = [
  {
    text: "从这里开始",
    collapsed: true,
    items: links(startSidebarItems)
  },
  {
    text: "基础课程",
    collapsed: true,
    items: [
      collapsedSidebarGroup(theoryGroup),
      collapsedSidebarGroup(trainingCaseGroup),
      collapsedSidebarGroup(algorithmGroup)
    ]
  },
  {
    text: "专题课程",
    collapsed: true,
    items: [
      { text: "进阶专题总览", link: "/06-拓展知识库/" },
      { text: "前沿瓶颈地图", link: "/06-拓展知识库/前沿瓶颈地图" },
      ...topicSidebarGroups
    ]
  },
  {
    text: "论文研读",
    collapsed: true,
    items: [
      {
        text: "论文导览",
        collapsed: true,
        items: links([
          ["论文研读入口", "/06-拓展知识库/论文研读/"],
          ["如何读懂一篇论文", "/06-拓展知识库/论文研读/03-如何读懂一篇论文"],
          ["论文知识图谱", "/06-拓展知识库/论文研读/02-跨系列问题地图"],
          ["论文材料库与学习进度", "/06-拓展知识库/论文研读/01-论文库"]
        ])
      },
      {
        text: "模型系列",
        collapsed: true,
        items: seriesPaperCourses.map((course) => collapsedSidebarGroup(seriesPaperGroup(course)))
      },
      { text: "研究问题", collapsed: true, items: links(researchQuestionItems) },
      { text: "跨系列专题", link: "/06-拓展知识库/论文研读/#跨系列专题" }
    ]
  },
  {
    text: "查阅工具",
    collapsed: true,
    items: [
      collapsedSidebarGroup(mathSupportGroup),
      collapsedSidebarGroup(visualSupportGroup),
      collapsedSidebarGroup(referenceGroup)
    ]
  },
  { text: "支持课程", link: "/08-支持课程/" }
];
