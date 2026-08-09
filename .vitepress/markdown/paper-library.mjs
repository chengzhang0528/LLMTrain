import { readFileSync } from "node:fs";
import path from "node:path";

export function validatePaperCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.papers)) {
    return ["必须包含 papers 数组"];
  }
  if (!String(catalog.updated ?? "").trim()) errors.push("缺少核查日期");

  const ids = new Set();
  for (const [index, paper] of catalog.papers.entries()) {
    const label = `第 ${index + 1} 项`;
    if (!paper || typeof paper !== "object") {
      errors.push(`${label} 不是对象`);
      continue;
    }
    if (!String(paper.id ?? "").trim() || ids.has(paper.id)) errors.push(`${label} id 缺失或重复`);
    ids.add(paper.id);
    for (const field of ["family", "title", "kind", "evidence", "level", "url", "note"]) {
      if (!String(paper[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
    }
    if (!Number.isInteger(paper.year) || paper.year < 2020 || paper.year > 2100) errors.push(`${label} year 异常`);
    if (!Array.isArray(paper.topics) || !paper.topics.length) errors.push(`${label} 至少需要一个研究问题标签`);
    if (!/^https:\/\//.test(String(paper.url ?? ""))) errors.push(`${label} URL 必须使用 HTTPS`);
  }
  return errors;
}

const familyDetailBases = {
  GLM: "/06-拓展知识库/论文研读/GLM深读/论文详情",
  Kimi: "/06-拓展知识库/论文研读/Kimi深读/论文详情",
  DeepSeek: "/06-拓展知识库/论文研读/DeepSeek深读/论文详情",
  Qwen: "/06-拓展知识库/论文研读/Qwen深读/论文详情"
};

const richDetailHrefs = {
  "glm-foundation": "/06-拓展知识库/论文研读/GLM深读/01-GLM预训练目标",
  "glm-130b": "/06-拓展知识库/论文研读/GLM深读/02-GLM-130B规模化",
  "chatglm-family": "/06-拓展知识库/论文研读/GLM深读/03-ChatGLM对话对齐",
  "glm-45": "/06-拓展知识库/论文研读/GLM深读/04-GLM-4.5智能体",
  "glm-5": "/06-拓展知识库/论文研读/GLM深读/05-GLM-5长任务",
  "kimi-k15": "/06-拓展知识库/论文研读/Kimi深读/01-k1.5长思维链强化学习",
  moba: "/06-拓展知识库/论文研读/Kimi深读/02-MoBA稀疏注意力",
  "kimi-k2": "/06-拓展知识库/论文研读/Kimi深读/03-Kimi-K2原生Agent",
  "kimi-linear": "/06-拓展知识库/论文研读/Kimi深读/04-Kimi-Linear混合注意力",
  "kimi-k25": "/06-拓展知识库/论文研读/Kimi深读/05-Kimi-K2.5原生多模态",
  "deepseek-llm": "/06-拓展知识库/论文研读/DeepSeek深读/01-DeepSeek-LLM基础模型",
  "deepseek-moe": "/06-拓展知识库/论文研读/DeepSeek深读/02-DeepSeekMoE专家路由",
  "deepseek-v2": "/06-拓展知识库/论文研读/DeepSeek深读/03-DeepSeek-V2-MoE与MLA",
  "deepseek-v3": "/06-拓展知识库/论文研读/DeepSeek深读/04-DeepSeek-V3规模化训练",
  "deepseek-r1": "/06-拓展知识库/论文研读/DeepSeek深读/05-DeepSeek-R1推理强化学习",
  janus: "/06-拓展知识库/论文研读/DeepSeek深读/06-Janus统一视觉生成",
  qwen: "/06-拓展知识库/论文研读/Qwen深读/01-Qwen基础模型",
  qwen25: "/06-拓展知识库/论文研读/Qwen深读/02-Qwen2.5通用主干",
  "qwen2-vl": "/06-拓展知识库/论文研读/Qwen深读/03-Qwen2-VL视觉编码",
  "qwen25-coder": "/06-拓展知识库/论文研读/Qwen深读/04-Qwen2.5-Coder代码模型",
  qwen3: "/06-拓展知识库/论文研读/Qwen深读/05-Qwen3思考模式与推理",
  "qwen25-omni": "/06-拓展知识库/论文研读/Qwen深读/06-Qwen2.5-Omni原生多模态"
};

function studyBrief(problem, mechanism, training, evidence, boundary) {
  return { problem, mechanism, training, evidence, boundary };
}

const paperStudyBriefs = {
  "glm-foundation": studyBrief("在 BERT 的双向理解和 GPT 的顺序生成之间找到统一的预训练目标。", "重点看 autoregressive blank infilling：上下文位置与目标 span 的可见性不同，损失只落在被挖空的 span 上。", "预训练目标改变权重；补全或续写时的 mask、提示和解码属于推理接口，不能把两者混成同一个过程。", "核对 mask、位置编码、下游基线和 span 长度消融，不要只引用“兼得理解与生成”。", "这是原始 GLM 目标，后续 ChatGLM/GLM-4/5 的数据、词表和后训练都需重新核对。"),
  "glm-130b": studyBrief("在双语数据和有限集群约束下训练一个可开放、可复核的大规模基座。", "重点看数据清洗/配比、并行切分、混合精度、检查点恢复和数值稳定，而不是只记 130B。", "预训练决定容量与语言分布；推理时的权重分片、KV Cache 和服务 batch 是另一套资源账。", "核对训练 token、语言配比、并行拓扑、硬件、精度、评测模板和开放权重范围。", "报告未公开的清洗细节和跨硬件复现条件不能被默认补齐。"),
  "chatglm-family": studyBrief("把生成式基座变成能理解轮次、遵循指令、处理安全边界和工具协议的对话模型。", "按基座、SFT、偏好/安全数据、对话模板和工具 schema 分层，观察每层改变了什么行为。", "对齐训练更新权重；多轮上下文、检索、工具返回和解码参数只在本次推理生效。", "分别核对基座/Chat/Tool 版本、模板、人工偏好、安全误拒与工具调用成功率。", "家族报告的组合结果不能回溯成某一项 SFT 或参数规模的单独功劳。"),
  "glm-45": studyBrief("让同一模型在知识问答、推理、代码和工具环境中完成长任务。", "重点看 ARC 三类能力的任务数据、推理预算、工具协议、轨迹筛选和 Agent harness。", "轨迹/RL 在训练期塑造策略；推理期的工具权限、失败重试和服务调度决定端到端能力。", "核对裸模型与带工具系统的边界、重试次数、测试环境、token 预算和尾延迟。", "Agent 分数不能直接当作裸模型分数，也不能推出所有工具接口都可迁移。"),
  "glm-5": studyBrief("在长文档和软件工程长轨迹中降低历史访问成本并保持可行动性。", "重点看 DSA/稀疏访问、索引复用、异步 RL 与长程 Agent 的组合信息流。", "长上下文数据和 RL 让策略适应访问模式；推理速度还受索引、内核、工具和网络影响。", "核对稀疏比例、关键证据命中率、短/长上下文、工具等待和组合消融。", "稀疏注意力解决访问效率，不会自动解决事实缺失、奖励错误或权限安全。"),
  "glm-45v": studyBrief("让视觉输入参与推理、定位、OCR 和工具任务，而不是只把图像转成一句描述。", "关注视觉编码器、视觉 token/特征、连接器、空间信息与可扩展 RL 的接口。", "图文预训练与视觉后训练塑造对齐；推理时分辨率、帧数和视觉 token 数决定成本。", "分别核对 OCR、小字、空间关系、视觉推理和工具调用，绑定图像尺寸与预算。", "视觉推理高分不能证明所有文档、视频或提示注入场景都可靠。"),
  "glm-speech-text": studyBrief("用交错语音-文本数据让语言模型学习跨模态语义和声学上下文。", "重点看语音编码粒度、交错序列格式、合成数据来源以及语言/声学损失如何配平。", "合成数据和联合预训练改变表示；实时转写或语音输出还要有独立声学解码管线。", "核对语音识别、语义理解、说话人/噪声分层，以及合成数据与真实数据的比例。", "语音-文本统一序列不等于所有音频任务共享同一文本词表。"),
  "glm-4-voice": studyBrief("把文字对话扩展为端到端语音交互，降低听说之间的断裂和等待。", "画出语音输入编码、语言推理、语音生成头、流式 chunk 和中断处理。", "语音/文本对齐和指令后训练改变行为；推理时首音频延迟、播放缓冲和网络是系统变量。", "核对 WER、语义正确率、首音频/持续延迟、打断恢复和不同口音。", "聊天质量高不等于语音自然、实时或隐私安全。"),
  "glm-tts": studyBrief("把 GLM 家族扩展到可控语音生成，研究文本/语义表示如何变成声学输出。", "关注文本到语音的中间表示、韵律/说话人条件、声码器或生成头的职责边界。", "训练阶段分别处理文本、声学和说话人数据；推理阶段需要按帧生成并控制延迟。", "核对 MOS/听感、音素/韵律、长文本稳定性、音色保持和实时因子。", "语音自然度、事实正确性和安全合成是三套验收，不可用一个总分替代。"),
  "glm-ocr": studyBrief("从文档图片恢复文字、布局和结构化内容，解决纯语言模型看不到像素的问题。", "拆分视觉编码、版面/表格感知、连接器和结构化文本生成，观察错误在哪一层发生。", "OCR 数据和文档后训练塑造感知/生成；推理时分辨率、裁剪和版面复杂度决定信息损失。", "核对字符准确率、表格/公式、阅读顺序、低清晰度和多语言文档。", "OCR 正确不等于下游事实正确，结构恢复错误可能在语言生成阶段被放大。"),
  "glm-indexcache": studyBrief("减少稀疏注意力重复计算索引的开销，让理论稀疏更接近服务端收益。", "重点看跨层索引复用的假设、索引缓存生命周期、命中率和失配时的回退路径。", "它是推理系统机制，不是新的预训练目标；训练好的模型能否适应复用规则需单独验证。", "核对索引计算时间、复用命中、质量回退、上下文长度、batch 和 kernel 版本。", "机制伴读论文不能直接证明 GLM-5 产品已采用或获得同样收益。"),
  "glm-image-release": studyBrief("记录 GLM 图像生成分支的产品定位和接口，观察它与文本模型主干的边界。", "关注图像生成模块、文本条件输入、分辨率/编辑接口和是否采用扩散或流式生成。", "发布说明通常只给模型卡和示例；训练细节、数据和消融不能从产品页面推断。", "核对版本、许可证、输入输出格式、文字渲染和安全过滤，不把示例当 benchmark。", "当前没有独立技术论文，证据层级低于正式报告。"),
  "glm-asr-release": studyBrief("识别 GLM-ASR-Nano 的语音识别定位，避免把 ASR、TTS 和语音聊天混为一个模型。", "关注声学输入、语言解码、时间戳/流式接口和噪声处理，而非只看一句转写示例。", "公开材料主要是模型卡/仓库说明，不能把部署 API 误读成训练流程。", "核对 WER 的语言、口音、噪声、实时因子和长音频切分口径。", "没有独立技术论文时，只能记录发布事实和待核查问题。"),
  "kimi-k15": studyBrief("用长思维链、搜索和强化学习提升数学、代码和视觉推理。", "重点看长轨迹、部分轨迹、课程/筛选、可验证奖励与推理预算的协同。", "RL 在训练期改变策略；temperature/top-p 只改变固定权重本次采样，不能把两种随机性混为一谈。", "核对成功样本长度、pass@k、验证器覆盖、多模态任务和采样次数。", "可验证数学的结论不能直接迁移到开放世界事实性。"),
  moba: studyBrief("在长上下文中减少每个 query 读取全部历史块的成本。", "理解 block 切分、路由/top-k、块内精确注意力、漏证据风险和稀疏 kernel。", "训练要让路由学习长距离依赖；推理收益取决于索引、内存访问、batch 和硬件。", "核对读取块比例、远距依赖命中率、短/长任务质量和 wall-clock 延迟。", "FLOPs 下降不保证端到端变快，top-k 过小会牺牲关键证据。"),
  "muon": studyBrief("探索适合大语言模型规模化训练的优化器更新，改善训练效率或稳定性。", "重点看矩阵更新的正交化/归一化、参数组差异、动量和与 AdamW 的公平比较。", "优化器只在训练时改变权重；推理服务不会因为使用 Muon 而在线继续学习。", "核对同一模型、数据、token、学习率预算和 wall-clock 的对照/消融。", "优化器收益高度依赖模型结构、精度和调参，不能当成通用常数。"),
  "kimi-vl": studyBrief("让 Kimi 语言主干处理图像、文档和视觉推理的长上下文任务。", "画出视觉编码器、连接器、语言主干、分辨率/视频 token 和输出头。", "图文预训练与视觉后训练对齐表示；推理成本受图片尺寸、帧数和文本上下文共同影响。", "核对 OCR、空间关系、长图文、视频、推理预算和视觉 token 数。", "视觉模型家族的接口和训练阶段可能随版本变化，不能只看品牌名。"),
  "kimi-audio": studyBrief("把音频理解、语音交互和语言推理接入同一模型家族。", "关注音频编码器、声学/文本 token、时间对齐、语音输出头和实时流式接口。", "音频-文本对齐、指令数据和语音生成分别训练；推理还要计入编码与播放缓冲。", "核对 ASR、音频问答、噪声/口音、首音频延迟和自然度。", "音频输入不等于文本词表，语义正确也不等于听感和实时性达标。"),
  "kimi-k2": studyBrief("把大规模 MoE 基座训练成能规划、调用工具和完成代码任务的 Agent。", "分开总参数/激活参数、专家路由、MuonClip、工具 schema、轨迹数据和环境循环。", "预训练写入知识，Agent 后训练写入行动策略；推理时工具返回和调度器决定下一状态。", "核对 1T/32B 口径、Agent harness、重试、工具等待、通信和跨域回归。", "带工具系统分数不能直接代表裸模型能力。"),
  "kimi-linear": studyBrief("用 KDA 的固定状态降低长上下文缓存，再用少量 MLA 保留精确全局回看。", "重点看状态更新、KDA/MLA 层比例、KV Cache 形状、质量-TPOT 曲线和 kernel。", "混合架构需要联合训练；推理时 KDA 状态并非零成本，MLA 层仍保留显式历史。", "核对上下文长度、缓存字节、层比例、prefill/decode、batch 和长距检索质量。", "短请求或没有专用内核时，理论节省可能不转化为端到端收益。"),
  "kimi-k25": studyBrief("将视觉文本持续训练与 Agent Swarm 结合，处理复杂多模态长任务。", "拆分视觉编码/连接器、语言主干、任务分解、子 Agent 消息协议和最终验收。", "持续预训练和 Agent 轨迹塑造能力；推理成本还包括重复视觉输入、协调等待和工具权限。", "核对图像/视频 token、子 Agent 数、重复上下文、并行度、失败合并和安全。", "“原生多模态”和 Swarm 都是组合主张，不能归因给单个模块。"),
  "attention-residuals": studyBrief("解决深层网络中逐层相加的残差信息混合过于固定、深度扩展难稳定的问题。", "关注跨层残差的可学习加权、归一化、梯度路径和与普通 residual stream 的差别。", "训练阶段学习跨层混合；推理阶段增加的是层间计算/缓存，不是外部记忆。", "核对深度扩展、消融、训练稳定、吞吐和不同宽度/层数的公平基线。", "机制论文的结果不能直接等同于 Kimi K3 的组合收益。"),
  "kimi-k3": studyBrief("把 KDA、Gated MLA、AttnRes、Stable LatentMoE、长上下文和多模态组合成开放前沿系统。", "按已有 Kimi K3 七单元路线逐层审查信息流、状态、专家、训练、后训练和基础设施。", "报告中的预训练、可验证 RL、多模态和服务优化必须分栏，不能只看最终分数。", "核对总/激活参数、层数、上下文、训练 token、评测 harness 和作者主张边界。", "技术报告是组合证据，未提供单项消融时不能拆分贡献。"),
  "flash-kda-release": studyBrief("为 KDA 提供可运行的 GPU 内核，让固定状态注意力的理论优势落到真实服务。", "关注 kernel 融合、状态布局、精度、序列长度、并发和回退实现。", "这是推理实现，不改变模型权重；训练得到的 KDA 模型仍需匹配内核接口。", "核对硬件、CUDA/驱动、batch、TPOT、吞吐、数值误差和长序列质量。", "仓库说明不是模型论文，不能把单机 benchmark 外推到所有部署。"),
  "deepseek-llm": studyBrief("建立开放语言模型基线，记录数据、tokenizer、规模和评测如何共同限制结论。", "重点看数据配比、去重、词表效率、模型尺寸和 base/chat 分层。", "预训练更新基座；SFT/对齐改变行为；推理引擎只执行固定权重和采样。", "核对训练 token、语言比例、上下文、模板、shot、精度和硬件。", "开放报告不等于全部数据清洗规则和独立复现都公开。"),
  "deepseek-coder": studyBrief("让通用语言模型掌握代码补全、仓库结构和 Fill-in-the-Middle。", "关注代码数据清洗/去重、FIM 格式、语言覆盖、长文件切分和代码指令。", "继续预训练改变代码分布，后训练改变修复/解释格式；执行测试属于推理环境。", "核对 pass@1/pass@k、数据污染、语言分层、上下文截断和编译测试。", "代码基准高不等于仓库级 Agent、安全和许可证审查通过。"),
  "deepseek-moe": studyBrief("在大总容量下控制每 token 计算，并让专家形成可利用的专门化。", "重点看细粒度专家、共享专家、top-k 路由、容量溢出和跨卡通信。", "路由/负载损失在训练期塑造专家；推理期 dispatch、聚合和 batch 决定速度。", "核对总/激活参数、专家负载、溢出、通信和 dense 基线。", "均匀负载不代表语义路由正确，MoE 也不自动减少 KV Cache。"),
  "deepseek-math": studyBrief("通过数学数据、合成题和可验证奖励提升开放模型的数学推理。", "重点看数学语料构造、解题轨迹、GRPO/策略优化和答案验证器。", "训练阶段用可检查答案塑造策略；推理时长 CoT、采样和投票是额外预算。", "核对竞赛题污染、pass@k、验证器覆盖、最终答案与过程可靠性。", "数学验证闭环不能直接推广到开放世界事实。"),
  "deepseek-vl": studyBrief("把真实图片、文档和视觉问答接入语言主干，而不是只做实验室图文配对。", "画出视觉编码器、适配器、语言模型、OCR/文档输入和输出任务。", "图文对齐和视觉指令数据塑造接口；推理时分辨率、裁剪和视觉 token 决定信息损失。", "核对 OCR、空间关系、文档、低清晰度、视觉幻觉和图像尺寸。", "早期 VL 接口与后续 VL2/Janus 不同，不能按家族名合并。"),
  "deepseek-v2": studyBrief("把 DeepSeekMoE 与 MLA 组合，降低专家模型的激活和长上下文缓存成本。", "重点看 MLA 潜变量/KV Cache、共享与路由专家、通信和经济性对照。", "训练时联合稳定 MLA 与 MoE；推理时分别计缓存读写、专家 dispatch 和 kernel。", "核对缓存字节、总/激活参数、上下文、精度、batch 和 prefill/decode。", "经济性是特定负载与硬件条件下的系统结论。"),
  "deepseek-coder-v2": studyBrief("用更大的 MoE 基座和代码数据突破代码智能的上下文与能力边界。", "关注代码继续预训练、FIM、仓库级长上下文、专家容量和代码指令后训练。", "代码数据改变知识分布，测试/工具反馈只在推理循环中存在。", "核对代码污染、语言分层、pass@k、仓库任务、工具权限和回归。", "代码模型的排行榜提升不能替代真实工程验收。"),
  "deepseek-prover-v15": studyBrief("让形式化证明助手的反馈成为可执行奖励，并结合搜索扩展证明能力。", "重点看 Lean/证明助手接口、证明状态、RL 奖励、MCTS 分支和失败回退。", "训练得到证明策略；推理时证明搜索与助手检查提供硬反馈。", "核对可编译证明率、搜索预算、库版本、子目标长度和人工数学答案。", "形式化证明的可验证性不覆盖开放世界事实和非形式化表达。"),
  janus: studyBrief("同时支持视觉理解和图像生成，却不强迫两种任务使用同一条视觉表示。", "重点看理解编码器、生成编码器/离散视觉 token、共享语言主干和两类输出头。", "理解/生成数据与损失共同训练；推理时生成还要经过视觉解码过程，非普通文本采样。", "分别核对 OCR/定位/VQA 与文字渲染、构图、细节，做分支消融。", "统一主干不保证跨任务互相提升，生成事实性需要单独验证。"),
  "janus-flow": studyBrief("把自回归语言建模与 rectified flow 图像生成连接，减少把图像当文字 token 预测的误解。", "拆分语言规划、视觉 token/特征、flow 采样和图像解码的职责。", "语言与流模型可能有不同训练目标；推理生成步数、采样器和分辨率是系统变量。", "核对理解/生成质量、采样步数、分辨率、文字渲染和速度。", "统一交互接口不等于统一损失、统一表示或统一采样过程。"),
  "deepseek-vl2": studyBrief("把视觉语言模型扩展到 MoE，让不同视觉/语言模式可以选择不同专家。", "关注视觉 token 进入语言层的连接方式、专家路由、共享专家和跨模态负载。", "视觉对齐、语言继续训练和 MoE 路由共同塑造能力；推理要算视觉编码与专家通信。", "核对多图/视频/OCR、专家负载、视觉 token、上下文和吞吐。", "MoE 的稀疏计算可能增加跨卡通信，视觉质量也不由专家数单独决定。"),
  "deepseek-v3": studyBrief("在大规模 MoE 上把 MLA、FP8、并行、数据和 MTP 组成可训练系统。", "重点看低精度缩放/累加、负载均衡、通信、MTP 监督和故障恢复。", "训练效率来自多项系统改动；推理阶段的 MTP 接受率、kernel 和 KV Cache 需单独测。", "核对训练计算、FP8 算子、MTP 基线、上下文、硬件和质量回归。", "组合报告没有单项消融时不能把提升归给 FP8 或 MTP 单个因素。"),
  "deepseek-r1": studyBrief("用可验证奖励、冷启动、RL 和蒸馏塑造更强的多步推理策略。", "重点看奖励来源、rollout、拒绝采样、长 CoT、学生蒸馏和推理预算。", "训练采样会更新权重；部署采样只在固定权重的分布上选择 token。", "核对 AIME/代码、pass@k、验证器、蒸馏尺寸、长度成本和开放问答事实性。", "R1 改善可验证推理不等于解决幻觉或所有领域的过程可靠性。"),
  "deepseek-prover-v2": studyBrief("把长形式化证明拆成可验证子目标，降低单次证明规划的难度。", "关注子目标生成、证明助手反馈、RL、搜索树和主证明/子证明衔接。", "验证器提供硬奖励；推理时搜索深度、库版本和回退策略决定成功率。", "核对可编译率、子目标长度、搜索预算、定理库和失败类型。", "子目标分解经验不能直接等价为通用 Agent 规划能力。"),
  "deepseek-ocr": studyBrief("用视觉上下文压缩把文档信息更高效地送入语言模型。", "重点看图像到视觉 token 的压缩比例、阅读顺序、版面/表格和语言解码。", "视觉压缩与文档数据训练共同决定信息保留；推理分辨率和压缩率是质量/成本旋钮。", "核对 token 压缩率、字符/表格/公式、长文档位置和低清晰度。", "压缩率高不代表信息无损，OCR 错误会在后续生成中被放大。"),
  "deepseek-ocr2": studyBrief("继续研究视觉因果流如何改善文档读取与结构恢复。", "重点比较 OCR-1 的视觉流向、特征交互、布局建模和文本生成接口。", "训练数据、视觉编码和结构化损失需要与 OCR-1 做版本对齐。", "核对同一文档集上的字符、阅读顺序、表格、公式和 token 成本。", "作为后续技术报告，版本与独立复现状态要持续核查。"),
  "deepseek-engram": studyBrief("在 MoE 之外增加可扩展查表记忆，把静态模式记忆与动态神经计算分开。", "关注 n-gram/lookup 索引、条件门控、内存规模、命中模式和 iso-参数/iso-FLOPs 对照。", "查表本身不是在线学习；训练决定何时使用记忆，推理时索引查找是额外系统路径。", "核对固定参数/固定 FLOPs 对照、缓存/带宽、长尾 token 和新文本泛化。", "仓库随附论文的独立验证较少，不能把查表记忆当作事实数据库。"),
  "deepseek-v32-exp": studyBrief("用实验版本探索 DSA 等稀疏访问在长上下文服务中的实际收益。", "重点看 sparse pattern、索引、回退路径、kernel 和短/长负载差异。", "这是部署/实验说明，不等于新的预训练配方；模型权重和服务版本必须绑定。", "核对仓库 commit、硬件、上下文、质量回退、TTFT/TPOT 和失败样例。", "发布说明只能证明公开版本存在，不能替代完整论文因果证据。"),
  "deepseek-math-v2": studyBrief("让模型自己生成、检查和修正数学证明，尝试形成自验证闭环。", "关注证明生成器、验证器/批评器、自我修正循环和奖励作弊风险。", "验证器反馈可进入 RL 或筛选；推理时多轮修正会增加 token 和搜索成本。", "核对证明可验证率、错误定位、循环次数、定理库和最终答案。", "仓库报告的自验证范围主要是数学证明，不能推广为通用事实校验器。"),
  "qwen": studyBrief("建立多语言、代码和知识任务的通用文本基座与词表基线。", "重点看 tokenizer、多语言数据配比、模型尺寸、长上下文和 base/instruct 分层。", "预训练写入语言分布，后训练改变遵循指令；多模态分支有独立编码接口。", "核对 token 长度效率、语言/领域配比、上下文、模板和评测脚本。", "支持语言数不等于各语言质量均衡，也不等于事实性保证。"),
  "qwen-vl": studyBrief("让模型完成视觉问答、定位和文字阅读，建立早期视觉语言接口。", "关注视觉编码器、连接器、区域/坐标表示、OCR 数据和语言生成。", "图文对齐与视觉指令数据训练接口；推理时分辨率和裁剪影响小字/空间信息。", "分别核对 VQA、定位、OCR、短图文和视觉幻觉，绑定图像尺寸。", "早期 VL 结果不能直接迁移到 Qwen2-VL/Qwen3-VL。"),
  "qwen-audio": studyBrief("统一音频理解、语音识别和音频问答的语言接口。", "关注音频编码、时间窗口、文本提示、任务标签和多任务数据配比。", "音频-语言对齐训练改变表示；推理阶段采样率、时长和噪声是主要变量。", "核对 ASR、事件/音乐/语音问答、口音噪声和长音频切分。", "音频理解不是把波形直接送入文本 tokenizer，任务间也可能互相干扰。"),
  "qwen2": studyBrief("在 Qwen 初代基线上扩展模型尺寸、上下文、多语言和指令能力。", "比较数据、词表、位置策略、模型规模和后训练，而不是只看版本号。", "继续预训练/后训练分别影响知识和行为；推理模板与解码需固定。", "核对同尺寸/同预算对照、长上下文、语言分层和安全回归。", "Qwen2 的结果不能自动代表 Qwen2-VL、Audio 或后续 Qwen3。"),
  "qwen2-audio": studyBrief("将音频问答、语音识别和音频定位扩展到更统一的 Qwen2 接口。", "关注音频 token/特征、任务提示、时间/空间定位输出和语言主干连接。", "多任务音频数据与指令后训练塑造行为；推理成本受时长、采样率和缓存影响。", "核对 ASR、音频事件、定位、噪声/口音和实时性。", "统一接口不等于所有音频任务共享同样的最佳表示。"),
  "qwen25-math": studyBrief("通过自我改进、合成数据和验证信号训练数学专家模型。", "重点看题目生成/过滤、解题轨迹、答案验证、RL/偏好和通用能力回归。", "验证器在训练中提供奖励；推理时 CoT、采样和投票是额外搜索预算。", "核对题目污染、pass@k、最终答案/过程、难度分层和非数学回归。", "数学专家不等于通用模型，验证信号也不覆盖开放事实。"),
  "qwen25-coder": studyBrief("用代码继续预训练和指令数据提高补全、修复、解释与仓库理解。", "关注代码数据清洗/去重、FIM、语言覆盖、长文件和执行反馈。", "领域继续训练改变代码分布；编译/测试只在推理环境提供验证。", "核对 pass@1/pass@k、污染、语言、仓库级任务、许可证和回归。", "补全分数不能代替真实软件工程安全与维护能力。"),
  "qwen2-vl": studyBrief("用动态分辨率、空间/时间信息提升任意尺寸图像、视频和文档理解。", "重点看视觉 token 数、patch/合并、位置编码、OCR、视频帧采样和连接器。", "视觉-语言持续训练对齐表示；推理时分辨率、帧数直接改变上下文和显存。", "核对小字 OCR、空间关系、视频时间、图表和 token/延迟曲线。", "高分辨率能保留细节但增加成本，不能保证所有视觉任务都提升。"),
  "qwen25": studyBrief("通过更高质量数据、长上下文和后训练升级通用 Qwen 主干。", "把数据配方、合成/过滤、上下文训练、指令/安全后训练分别对账。", "训练期更新权重；thinking、工具、检索和解码是推理期变量。", "核对 base/instruct、短/长文本、代码/数学、安全误拒和评测模板。", "组合报告的能力提升不能只归因给参数或数据量。"),
  "qwen25-vl": studyBrief("把视觉理解扩展到文档、视频、空间推理和视觉 Agent。", "关注高分辨率视觉编码、时间采样、文档结构、工具调用和视觉轨迹。", "视觉预训练、指令/RL 和 Agent 数据共同训练；推理还要计工具和图像成本。", "核对文档/OCR、视频、空间、视觉工具和提示注入的分层结果。", "视觉 Agent 结果依赖 harness，不能等同裸视觉模型能力。"),
  "qwen25-omni": studyBrief("将文本、图像、音频、视频输入与文本/语音输出放入实时交互闭环。", "画出各模态编码器、连接器、语言主干、语音生成头和流式缓冲。", "多模态联合训练与语音/文本监督共同塑造接口；推理受帧数、采样率、编码和网络影响。", "核对文本/视觉/音频/视频分层、首字/首音频、持续延迟和跨模态冲突。", "原生多模态不等于所有模态共用文本词表或同等质量。"),
  "qwen3": studyBrief("在同一模型家族中提供 thinking 与 non-thinking 两种推理预算/行为模式。", "重点看 MoE、推理数据、可验证 RL、蒸馏、模式标记和长度效率。", "后训练塑造策略；运行时开关和 max thinking token 不会更新权重。", "核对模式、模板、token 预算、采样/投票、工具和短模式回归。", "长 thinking 只增加搜索机会，不自动增加事实可靠性。"),
  "qwen3-embedding": studyBrief("把 Qwen 家族的表示能力用于向量检索和重排序，而不是继续生成回答。", "区分 embedding 向量、reranker 分数、查询/文档指令和多语言对齐。", "对比学习/指令训练改变表示；推理阶段是向量化、召回、排序的系统流水线。", "核对 Recall@k、nDCG、长文档、跨语言、向量维度和索引成本。", "检索分数高不等于生成模型事实正确，embedding 也不应按聊天 benchmark 评估。"),
  "qwen-image": studyBrief("在 Qwen 家族中研究图像生成、文字渲染和可控视觉输出。", "关注文本条件编码、扩散/流式生成、分辨率、文字布局和编辑接口。", "图像生成目标与语言 next-token 不同；推理采样步数、guidance 和解码器决定成本。", "核对文字准确、构图、细节、编辑一致性、安全和采样步数。", "图像生成质量不能用文本模型分数或单张示例证明。"),
  "qwen3-omni": studyBrief("进一步探索多模态实时输入、文本/语音输出和跨模态推理。", "比较 Qwen2.5-Omni 的编码器、连接器、实时流和输出头变化。", "联合预训练、对齐/RL 和语音生成训练需分开；推理成本受输入模态组合影响。", "核对单/混合模态、首响应/持续延迟、音频自然度、视频时间和安全。", "版本更新快，不能把产品演示当独立机制消融。"),
  "qwen3guard": studyBrief("用专门安全模型判断输入输出风险，补上生成模型之外的治理层。", "关注分类/生成式防护、风险类别、拒答标签、多语言和上下文窗口。", "安全数据与分类目标训练 guard；推理时它作为前后置过滤器，不改变主模型权重。", "核对漏放、误拒、类别/语言、攻击集、延迟和与主模型组合策略。", "Guard 的安全分数不能代表主模型事实性或所有应用风险。"),
  "qwen3-vl": studyBrief("把视觉推理、长视频、文档和工具调用进一步统一到 Qwen3 行为接口。", "关注视觉 token/空间时间表示、thinking 模式、视觉 Agent 轨迹和工具 schema。", "视觉持续训练与推理后训练共同塑造能力；推理时帧数、分辨率、工具和预算必须记录。", "核对 OCR、视频长程、空间、视觉数学/代码、工具失败和模式回归。", "视觉推理长轨迹可能增加成本与幻觉，不能只看平均分。"),
  "qwen-image-layered": studyBrief("让图像生成结果保留可分层编辑的结构，而不是只能生成一张不可修改的位图。", "关注层分解表示、前景/背景/透明度、生成-重建目标和编辑一致性。", "训练需要图像层/合成或分解监督；推理时层数、分辨率和编辑步骤决定成本。", "核对单图质量、层可编辑性、遮挡/透明、重建误差和多轮编辑。", "可编辑表示增加结构约束，不保证文字、事实或复杂遮挡都正确。"),
  "qwen3-coder-next": studyBrief("面向仓库级代码 Agent，把混合注意力、长上下文和工具轨迹结合。", "重点看代码专门化、长仓库上下文、混合架构、工具协议和测试回路。", "代码继续训练/Agent 后训练改变行动策略；推理时编译、测试、重试和上下文压缩是系统变量。", "核对 issue/仓库版本、pass@1、测试通过率、补丁质量、重试和成本。", "仓库 benchmark 不能直接推出所有 IDE、语言和安全场景都可用。"),
  "qwen36-release": studyBrief("记录 Qwen3.6 的版本定位和能力方向，等待一手技术报告解释机制。", "先查模型结构、上下文、模式、代码/Agent 接口和与 Qwen3 的实际差异。", "发布说明不足以说明训练数据、后训练和消融；不要从 API 行为猜训练流程。", "核对版本、模型卡、官方 benchmark 条件和第三方复测。", "当前只能作为发布材料阅读，不能替代独立论文。"),
  "qwq-release": studyBrief("理解 QwQ 作为推理产品分支的定位，以及它与 Qwen2.5/Qwen3 报告的关系。", "关注 thinking 模式、推理预算、提示格式、蒸馏/后训练背景和评测任务。", "公开发布说明不等于完整 RL 配方；推理时采样和预算仍是运行时变量。", "核对模型卡版本、AIME/代码条件、长度成本、模式模板和回归。", "不能把 QwQ 发布说明当成独立训练细节论文。")
};

function addDetailLinks(catalog, family) {
  const detailBase = familyDetailBases[family];
  if (!detailBase) throw new Error(`paper-family 不支持系列：${family}`);
  return {
    ...catalog,
    papers: catalog.papers
      .filter((paper) => paper.family === family)
      .map((paper) => {
        const study = paperStudyBriefs[paper.id];
        if (!study) throw new Error(`缺少论文研读简报：${paper.id}`);
        return {
          ...paper,
          study,
          detailHref: richDetailHrefs[paper.id] ?? `${detailBase}?id=${encodeURIComponent(paper.id)}`
        };
      })
  };
}

function readCanonicalCatalog() {
  const sourcePath = path.resolve(process.cwd(), "06-拓展知识库/论文研读/01-论文库.md");
  const source = readFileSync(sourcePath, "utf8");
  const match = source.match(/```paper-library\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error("论文库缺少 paper-library JSON 目录");
  return JSON.parse(match[1]);
}

function encodeCatalog(source) {
  let catalog;
  try {
    catalog = JSON.parse(source);
  } catch (error) {
    throw new Error(`paper-library 必须是有效 JSON：${error.message}`);
  }

  const errors = validatePaperCatalog(catalog);
  if (errors.length) throw new Error(`paper-library ${errors[0]}`);

  return encodeURIComponent(JSON.stringify(catalog));
}

export function installPaperLibrary(md) {
  const fallback = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token.info.trim() === "paper-library") {
      return `<PaperLibrary spec="${encodeCatalog(token.content)}" />`;
    }

    if (token.info.trim() === "paper-family") {
      const family = token.content.trim();
      const catalog = addDetailLinks(readCanonicalCatalog(), family);
      return `<PaperLibrary spec="${encodeCatalog(JSON.stringify(catalog))}" />`;
    }

    if (token.info.trim() === "paper-family-detail") {
      const family = token.content.trim();
      const catalog = addDetailLinks(readCanonicalCatalog(), family);
      return `<PaperDetail spec="${encodeURIComponent(JSON.stringify(catalog))}" />`;
    }

    return fallback
      ? fallback(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
}
