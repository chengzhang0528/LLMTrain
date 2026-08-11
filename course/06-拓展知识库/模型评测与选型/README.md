# 模型榜单中心

<!-- benchmark-snapshot: 2026-08-12 -->

这是一个可更新的榜单入口，不是“全球模型总冠军”页面。每一张图只比较同一榜单、同一指标和同一运行口径；榜单之外的许可证、成本、延迟和业务失败，仍要在本地验收。

> **现实模型快照日期：2026-08-12。** “值得考虑”只表示进入候选池；动态榜单请以官方页面的最新版本为准。下载量、点赞和参数量不是质量分数。

```benchmark-chart
{
  "ariaLabel": "LiveBench 最新版本总分榜：五个模型的总体得分",
  "eyebrow": "客观任务 · 总体分",
  "title": "LiveBench 2026-06-25：总体分数",
  "subtitle": "23 个客观任务、7 个能力类别；分数越高越好。条形只在 LiveBench-2026-06-25 内可比。",
  "max": 100,
  "ticks": [0, 25, 50, 75, 100],
  "unit": "",
  "updated": "2026-06-25 release",
  "credibility": "B+ · 公开任务与代码，半年刷新",
  "bars": [
    { "label": "Claude Fable 5 Max", "value": 83, "display": "83.0", "note": "Max Effort", "tone": "brand", "status": "第 1" },
    { "label": "GPT-5.6 Sol", "value": 81, "display": "81.0", "note": "Max Effort", "tone": "blue", "status": "第 2" },
    { "label": "GPT-5.5 Thinking", "value": 80.2, "display": "80.2", "note": "xHigh Effort", "tone": "blue", "status": "第 3" },
    { "label": "Claude 5 Opus", "value": 80.1, "display": "80.1", "note": "Thinking · Max", "tone": "orange", "status": "第 4" },
    { "label": "Smaug-Agentic", "value": 79.5, "display": "79.5", "note": "开放权重", "tone": "muted", "status": "第 5" }
  ],
  "footnote": "这是客观任务集合的平均分，不是对话偏好，也不等于你的业务成功率。成本列与分类分数请在官方页面单独查看。",
  "source": "LiveBench 官方 · latest release 2026-06-25",
  "sourceUrl": "https://livebench.ai/",
  "sourceLabel": "打开 LiveBench"
}
```

```benchmark-chart
{
  "ariaLabel": "Arena Text Overall 榜单：五个模型的 Elo 风格分数",
  "eyebrow": "人类偏好 · Text Arena",
  "title": "Arena 2026-08-11：对话偏好分",
  "subtitle": "匿名用户成对投票后的排名分数；分数越高表示在该投票分布中更常被偏好，不是事实正确率。",
  "max": 1600,
  "ticks": [0, 400, 800, 1200, 1600],
  "unit": "",
  "updated": "2026-08-11",
  "credibility": "B · 7,765,220 votes，含不确定性",
  "bars": [
    { "label": "claude-fable-5", "value": 1506, "display": "1506 ±5", "note": "Anthropic · proprietary", "tone": "brand", "status": "第 1" },
    { "label": "claude-opus-4-6-thinking", "value": 1505, "display": "1505 ±4", "note": "Anthropic · proprietary", "tone": "blue", "status": "第 2" },
    { "label": "claude-opus-4-7-thinking", "value": 1502, "display": "1502 ±4", "note": "Anthropic · proprietary", "tone": "blue", "status": "第 3" },
    { "label": "muse-spark-1.2 (xHigh)", "value": 1498, "display": "1498 ±10", "note": "Meta · proprietary", "tone": "orange", "status": "第 4" },
    { "label": "claude-opus-4-6", "value": 1497, "display": "1497 ±3", "note": "Anthropic · proprietary", "tone": "muted", "status": "第 5" }
  ],
  "footnote": "Arena 的投票偏好会受提示分布、语言、用户群和裁判/展示方式影响；不要把它写成医疗、法律或事实性排行榜。",
  "source": "Arena 官方 · Text Arena Overall · 7,765,220 votes",
  "sourceUrl": "https://arena.ai/leaderboard/text",
  "sourceLabel": "打开 Arena"
}
```

```benchmark-terms
{
  "ariaLabel": "模型榜单中心核心术语",
  "eyebrow": "先记四个词",
  "title": "榜单不是同一种尺子",
  "terms": [
    { "term": "偏好分", "meaning": "人类或裁判更常选谁", "tone": "brand" },
    { "term": "客观任务", "meaning": "有可执行答案或规则的题", "tone": "blue" },
    { "term": "快照", "meaning": "日期、版本、配置一起保存", "tone": "orange" },
    { "term": "候选池", "meaning": "值得进入本地复核的模型集合", "tone": "danger" }
  ]
}
```

## 目录

| 页面 | 这里收什么 |
|---|---|
| [按能力分类的榜单](02-把评分指标翻成大白话.md) | 通用能力、中文、多模态、Embedding 的分能力入口 |
| [各机构榜单目录](03-判断榜单与结论有多可信.md) | 机构、官方链接、更新时间、可信度和限制，一页查全 |
| [代码与 Agent 榜单](04-按应用场景建立候选池.md) | SWE-bench、Aider、LiveBench Agentic Coding |
| [开放权重榜单](05-2026-08开放权重模型现状.md) | 只看公开权重时的榜单、许可证和部署边界 |
| [Embedding、OCR、ASR 与安全](06-不只选择生成模型.md) | RAG 组件、文档解析、语音识别和安全评测入口 |
| [从公开榜单到本地验收](07-从公开榜单到本地验收.md) | 用统一版本、配置和冻结集作最终决定 |

## 选型顺序

1. 先按任务类型进入对应榜单，不跨榜单相加。
2. 记录模型**具体版本、提示/模板、推理预算、工具、精度、价格和日期**。
3. 只把前几名放入候选池；再用开发评测集、冻结测试集和安全/成本红线决定。

## 更新机制

- 每个页面保留 `benchmark-snapshot` 日期和官方直链；页面快照超过 45 天会被仓库检查标红。
- GitHub Actions 每周检查快照年龄；过期时创建维护 Issue，提醒重新核对榜单和模型版本。
- 课程不静默抓取并重排动态数据：官方榜单负责实时展示，课程快照负责可追溯的教学记录。
