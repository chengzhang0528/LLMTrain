export const courseLessons = [
  { day: 1, phase: "理论", title: "大模型到底是什么", source: "01-14天理论课/D01-大模型到底是什么.md", href: "/01-14天理论课/D01-大模型到底是什么" },
  { day: 2, phase: "理论", title: "文字如何变成数字", source: "01-14天理论课/D02-文字如何变成数字.md", href: "/01-14天理论课/D02-文字如何变成数字" },
  { day: 3, phase: "理论", title: "够用就好的数学基础", source: "01-14天理论课/D03-够用就好的数学基础.md", href: "/01-14天理论课/D03-够用就好的数学基础" },
  { day: 4, phase: "理论", title: "神经网络如何学习", source: "01-14天理论课/D04-神经网络如何学习.md", href: "/01-14天理论课/D04-神经网络如何学习" },
  { day: 5, phase: "理论", title: "注意力机制", source: "01-14天理论课/D05-注意力机制.md", href: "/01-14天理论课/D05-注意力机制" },
  { day: 6, phase: "理论", title: "拼出完整 Transformer", source: "01-14天理论课/D06-拼出完整Transformer.md", href: "/01-14天理论课/D06-拼出完整Transformer" },
  { day: 7, phase: "理论", title: "模型如何生成文字", source: "01-14天理论课/D07-模型如何生成文字.md", href: "/01-14天理论课/D07-模型如何生成文字" },
  { day: 8, phase: "理论", title: "训练数据与分词器", source: "01-14天理论课/D08-训练数据与分词器.md", href: "/01-14天理论课/D08-训练数据与分词器" },
  { day: 9, phase: "理论", title: "一次完整训练循环", source: "01-14天理论课/D09-一次完整训练循环.md", href: "/01-14天理论课/D09-一次完整训练循环" },
  { day: 10, phase: "理论", title: "预训练与规模化训练", source: "01-14天理论课/D10-预训练与规模化训练.md", href: "/01-14天理论课/D10-预训练与规模化训练" },
  { day: 11, phase: "理论", title: "SFT、LoRA 与 QLoRA", source: "01-14天理论课/D11-SFT、LoRA与QLoRA.md", href: "/01-14天理论课/D11-SFT、LoRA与QLoRA" },
  { day: 12, phase: "理论", title: "对齐、强化学习与评测", source: "01-14天理论课/D12-对齐、强化学习与评测.md", href: "/01-14天理论课/D12-对齐、强化学习与评测" },
  { day: 13, phase: "理论", title: "推理、部署、RAG 与 Agent", source: "01-14天理论课/D13-推理、部署、RAG与Agent.md", href: "/01-14天理论课/D13-推理、部署、RAG与Agent" },
  { day: 14, phase: "理论", title: "多模态、应用全景与总复习", source: "01-14天理论课/D14-多模态、应用全景与总复习.md", href: "/01-14天理论课/D14-多模态、应用全景与总复习" },
  { day: 15, phase: "实践", title: "确定目标与跑通基线", source: "02-第3周实战/D15-确定目标与跑通基线.md", href: "/02-第3周实战/D15-确定目标与跑通基线" },
  { day: 16, phase: "实践", title: "准备和检查数据", source: "02-第3周实战/D16-准备和检查数据.md", href: "/02-第3周实战/D16-准备和检查数据" },
  { day: 17, phase: "实践", title: "搭建微型 Transformer", source: "02-第3周实战/D17-搭建微型Transformer.md", href: "/02-第3周实战/D17-搭建微型Transformer" },
  { day: 18, phase: "实践", title: "单批次过拟合与排错", source: "02-第3周实战/D18-单批次过拟合与排错.md", href: "/02-第3周实战/D18-单批次过拟合与排错" },
  { day: 19, phase: "实践", title: "正式训练与保存检查点", source: "02-第3周实战/D19-正式训练与保存检查点.md", href: "/02-第3周实战/D19-正式训练与保存检查点" },
  { day: 20, phase: "实践", title: "评测、生成与对照实验", source: "02-第3周实战/D20-评测、生成与对照实验.md", href: "/02-第3周实战/D20-评测、生成与对照实验" },
  { day: 21, phase: "实践", title: "模型卡、复现与成果验收", source: "02-第3周实战/D21-模型卡、复现与成果验收.md", href: "/02-第3周实战/D21-模型卡、复现与成果验收" }
];

const startItems = [
  ["课程入口", "/00-从这里开始/"],
  ["21 天路线图", "/00-从这里开始/21天路线图"],
  ["学习目标与边界", "/00-从这里开始/学习目标与边界"],
  ["学前自测", "/00-从这里开始/学前自测"],
  ["每日打卡表", "/00-从这里开始/每日打卡表"],
  ["环境与硬件选择", "/00-从这里开始/环境与硬件选择"],
  ["支持课程", "/08-支持课程/"]
];

const supportGroups = [
  {
    text: "数学急救包",
    collapsed: true,
    items: [
      ["使用说明", "/03-数学急救包/"],
      ["数、比例与平均数", "/03-数学急救包/01-数、比例与平均数"],
      ["向量、矩阵与点积", "/03-数学急救包/02-向量、矩阵与点积"],
      ["概率与 softmax", "/03-数学急救包/03-概率与softmax"],
      ["导数、梯度与学习率", "/03-数学急救包/04-导数、梯度与学习率"],
      ["对数与交叉熵", "/03-数学急救包/05-对数与交叉熵"]
    ]
  },
  {
    text: "图解与数字漫画",
    collapsed: true,
    items: [
      ["图解目录", "/04-图解与数字漫画/"],
      ["注意力：三张便签", "/04-图解与数字漫画/注意力-三张便签"],
      ["梯度下降：旋钮下山", "/04-图解与数字漫画/梯度下降-旋钮下山"],
      ["训练与验证：两套题", "/04-图解与数字漫画/训练与验证-两套题"]
    ]
  },
  {
    text: "速查与拓展",
    collapsed: true,
    items: [
      ["术语速查", "/05-速查表/术语速查"],
      ["公式速查", "/05-速查表/公式速查"],
      ["方法选择", "/05-速查表/方法选择"],
      ["训练排错", "/05-速查表/训练排错"],
      ["拓展知识库", "/06-拓展知识库/"]
    ]
  },
  {
    text: "来源与审计",
    collapsed: true,
    items: [
      ["审计说明", "/07-来源与质量审计/"],
      ["事实核查表", "/07-来源与质量审计/事实核查表"],
      ["参考资料", "/07-来源与质量审计/参考资料"],
      ["版本与适用范围", "/07-来源与质量审计/版本与适用范围"],
      ["内容编写规范", "/07-来源与质量审计/内容编写规范"],
      ["勘误记录", "/07-来源与质量审计/勘误记录"],
      ["首版验收报告", "/07-来源与质量审计/验收报告"]
    ]
  }
];

function links(items) {
  return items.map(([text, link]) => ({ text, link }));
}

export const sidebar = [
  { text: "开始学习", collapsed: false, items: links(startItems) },
  {
    text: "14 天理论课",
    collapsed: false,
    items: [
      { text: "理论课说明", link: "/01-14天理论课/" },
      ...courseLessons.slice(0, 14).map((lesson) => ({
        text: `D${String(lesson.day).padStart(2, "0")} · ${lesson.title}`,
        link: lesson.href
      }))
    ]
  },
  {
    text: "第 3 周实战",
    collapsed: true,
    items: [
      { text: "实战说明", link: "/02-第3周实战/" },
      ...courseLessons.slice(14).map((lesson) => ({
        text: `D${lesson.day} · ${lesson.title}`,
        link: lesson.href
      })),
      { text: "数据卡模板", link: "/02-第3周实战/数据卡模板" },
      { text: "模型卡模板", link: "/02-第3周实战/模型卡模板" }
    ]
  },
  ...supportGroups.map((group) => ({ ...group, items: links(group.items) }))
];
