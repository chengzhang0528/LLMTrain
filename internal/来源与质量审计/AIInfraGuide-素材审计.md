# AIInfraGuide 素材审计

核查日期：2026-08-08。

## 来源快照

- 网站：[AIInfraGuide](https://caomaolufei.github.io/AIInfraGuide/)
- 公开仓库：[caomaolufei/AIInfraGuide](https://github.com/caomaolufei/AIInfraGuide)
- 审阅提交：[`090873d7f280c022c070374df18d0711b3f7740c`](https://github.com/caomaolufei/AIInfraGuide/commit/090873d7f280c022c070374df18d0711b3f7740c)，提交时间 2026-07-25。

审阅范围包括总体学习路线、GPU 与 CUDA 前置、算子优化、集合通信、分布式训练、LLM 推理基础、PagedAttention、Continuous Batching、Prefix Cache、Chunked Prefill、图优化和性能指标。

## 吸收了什么

| 资料中的组织价值 | 本课程的转译 |
|---|---|
| 从硬件、算子、分布式到推理服务建立全栈视角 | 新增 [AI Infra 全栈责任地图](../../course/06-拓展知识库/软硬件瓶颈/00-AI-Infra全栈责任地图.md) |
| 用显存账本、算术强度和 Roofline 从数字解释瓶颈 | 扩充容量账本与计算/带宽章节 |
| 将 PagedAttention、连续批处理、前缀缓存、分块预填充和图执行放进同一引擎链 | 扩充推理引擎章节与预生成调度时间线 |
| 用集合通信原语解释并行策略 | 扩充 AllReduce、ReduceScatter、AllGather、All-to-All 和 ZeRO 教学 |
| 以性能指标和目标负载做优化选择 | 在服务案例加入 SLO 与有效吞吐 |

课程只吸收概念组织和问题拆解方式。所有文字、数字例子、Mermaid 图和案例均重新编写；未复制该站图片、代码、面试材料或命令。

## 来源等级与限制

AIInfraGuide 是高质量工程教程和二手整合资料，不等同于论文、硬件规格书或具体框架版本的官方文档。课程中的稳定机制还需由原始论文与官方文档支撑，版本相关结论必须重新核对。

该仓库 README 标注 `License: MIT`，但核查时 GitHub API 未识别许可证，下载快照中也未发现独立 `LICENSE` 文件。为避免许可含糊，课程不复制其资源，仅引用链接并独立转译。

## 特别降级处理的表述

- 未采用“GPU 利用率从某固定百分比提升到另一固定百分比”作为通用事实。
- 未把特定 H100 峰值、vLLM 默认参数或当前源码结构写成长期稳定结论。
- 未把 “prefill 总是计算受限、decode 总是带宽受限”写成无条件定律。
- 未要求学习者安装 CUDA、运行 kernel、部署服务或执行集群命令。

## 课程边界

本站是纯前端初学者课程。AI Infra 内容以责任地图、数值账本、冻结日志、预生成时间线和选择题呈现；目标是能解释和审查系统证据，不是培养 CUDA 实操或生产运维能力。
