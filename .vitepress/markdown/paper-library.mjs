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
    if (!paper.study || typeof paper.study !== "object" || Array.isArray(paper.study)) {
      errors.push(`${label} 缺少用户可见的论文导读`);
    } else {
      for (const field of ["problem", "mechanism", "training", "evidence", "boundary"]) {
        if (!String(paper.study[field] ?? "").trim()) errors.push(`${label} study 缺少 ${field}`);
      }
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

function addDetailLinks(catalog, family) {
  const detailBase = familyDetailBases[family];
  if (!detailBase) throw new Error(`paper-family 不支持系列：${family}`);
  return {
    ...catalog,
    papers: catalog.papers
      .filter((paper) => paper.family === family)
      .map((paper) => {
        if (!paper.study) throw new Error(`缺少论文导读：${paper.id}`);
        return {
          ...paper,
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
