import { readFileSync } from "node:fs";
import path from "node:path";
import { seriesPaperLessons } from "../course-data.mjs";

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

    const evidenceArxivId = String(paper.evidence ?? "").match(/\barXiv\s+(\d{4}\.\d{4,5})(?:v\d+)?\b/i)?.[1];
    const urlArxivId = String(paper.url ?? "").match(
      /^https:\/\/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i
    )?.[1];
    if (evidenceArxivId || urlArxivId) {
      if (!evidenceArxivId || !urlArxivId || evidenceArxivId !== urlArxivId) {
        errors.push(`${label} evidence 与 URL 的 arXiv 编号不一致`);
      } else {
        const arxivYear = 2000 + Number(urlArxivId.slice(0, 2));
        if (paper.year !== arxivYear) errors.push(`${label} year 与 arXiv 编号年份不一致`);
      }
    }
  }
  return errors;
}

const familyDetailBases = {
  GLM: "/06-拓展知识库/论文研读/论文",
  Kimi: "/06-拓展知识库/论文研读/论文",
  DeepSeek: "/06-拓展知识库/论文研读/论文",
  Qwen: "/06-拓展知识库/论文研读/论文"
};

const familySeriesHrefs = {
  GLM: "/06-拓展知识库/论文研读/04-GLM系列演进",
  Kimi: "/06-拓展知识库/论文研读/05-Kimi系列演进",
  DeepSeek: "/06-拓展知识库/论文研读/06-DeepSeek系列演进",
  Qwen: "/06-拓展知识库/论文研读/07-Qwen系列演进"
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
  "kimi-k3": "/06-拓展知识库/论文研读/Kimi深读/06-Kimi-K3技术报告",
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
const courseTitles = new Map(seriesPaperLessons.map((lesson) => [lesson.paperId, lesson.title]));
const courseOrder = new Map(seriesPaperLessons.map((lesson, index) => [lesson.paperId, index]));

function orderFamilyPapers(papers) {
  return papers
    .map((paper, sourceIndex) => ({ paper, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = courseOrder.get(left.paper.id);
      const rightOrder = courseOrder.get(right.paper.id);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ paper }) => paper);
}

function addDetailLinks(catalog, family) {
  const detailBase = familyDetailBases[family];
  if (!detailBase) throw new Error(`paper-family 不支持系列：${family}`);
  return {
    ...catalog,
    papers: orderFamilyPapers(catalog.papers.filter((paper) => paper.family === family))
      .map((paper) => {
        if (!paper.study) throw new Error(`缺少论文导读：${paper.id}`);
        return {
          ...paper,
          courseTitle: courseTitles.get(paper.id),
          detailHref: richDetailHrefs[paper.id] ?? `${detailBase}/${encodeURIComponent(paper.id)}`
        };
      })
  };
}

function addCatalogDetailLinks(catalog) {
  return {
    ...catalog,
    papers: catalog.papers.map((paper) => {
      const detailBase = familyDetailBases[paper.family];
      if (!detailBase) return paper;
      return {
        ...paper,
        courseTitle: courseTitles.get(paper.id),
        detailHref: richDetailHrefs[paper.id] ?? `${detailBase}/${encodeURIComponent(paper.id)}`
      };
    })
  };
}

function readCanonicalCatalog() {
  const sourcePath = path.resolve(process.cwd(), "course/06-拓展知识库/论文研读/01-论文库.md");
  const source = readFileSync(sourcePath, "utf8");
  const match = source.match(/```paper-library\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error("论文库缺少 paper-library JSON 目录");
  return JSON.parse(match[1]);
}

function buildPaperDetailSpec(id) {
  const catalog = addCatalogDetailLinks(readCanonicalCatalog());
  const paper = catalog.papers.find((entry) => entry.id === id);
  if (!paper) throw new Error(`论文详情未在论文库找到：${id}`);

  const familyPapers = orderFamilyPapers(catalog.papers.filter((entry) => entry.family === paper.family));
  const index = familyPapers.findIndex((entry) => entry.id === paper.id);
  const linkFor = (entry) => entry
    ? { title: entry.courseTitle ?? entry.title, href: entry.detailHref }
    : undefined;

  return {
    paper,
    richHref: richDetailHrefs[paper.id] ?? "",
    memory: {
      paper,
      sequence: {
        position: index + 1,
        total: familyPapers.length,
        seriesTitle: `${paper.family} 系列材料`,
        seriesHref: familySeriesHrefs[paper.family] ?? "/06-拓展知识库/论文研读/01-论文库",
        previous: linkFor(familyPapers[index - 1]),
        next: linkFor(familyPapers[index + 1])
      }
    }
  };
}

export function buildPaperDetailPaths() {
  return readCanonicalCatalog().papers.map((paper) => {
    const spec = buildPaperDetailSpec(paper.id);
    return {
      params: { id: paper.id },
      content: [
        "---",
        `title: ${JSON.stringify(paper.title)}`,
        `description: ${JSON.stringify(paper.note)}`,
        "prev: false",
        "next: false",
        "---",
        "",
        `# ${paper.title}`,
        "",
        `<PaperDetail spec="${encodeURIComponent(JSON.stringify(spec))}" />`,
        ""
      ].join("\n")
    };
  });
}

function buildPaperLessonSpec(id) {
  const catalog = readCanonicalCatalog();
  const paper = catalog.papers.find((entry) => entry.id === id);
  if (!paper) throw new Error(`paper-lesson 未在论文库找到：${id}`);
  if (!paper.study) throw new Error(`paper-lesson 缺少认知骨架：${id}`);
  if (!richDetailHrefs[id]) throw new Error(`paper-lesson 只用于完整深读课件：${id}`);

  const mainPapers = orderFamilyPapers(catalog.papers.filter(
    (entry) => entry.family === paper.family && richDetailHrefs[entry.id]
  ));
  const index = mainPapers.findIndex((entry) => entry.id === id);
  const toCourseLink = (entry) => entry
    ? { title: courseTitles.get(entry.id) ?? entry.title, href: richDetailHrefs[entry.id] }
    : undefined;

  return {
    paper,
    sequence: {
      position: index + 1,
      total: mainPapers.length,
      seriesTitle: `${paper.family} 主线`,
      seriesHref: familySeriesHrefs[paper.family],
      previous: toCourseLink(mainPapers[index - 1]),
      next: toCourseLink(mainPapers[index + 1])
    }
  };
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
      const catalog = JSON.parse(token.content);
      return `<PaperLibrary spec="${encodeCatalog(JSON.stringify(addCatalogDetailLinks(catalog)))}" />`;
    }

    if (token.info.trim() === "paper-family") {
      const family = token.content.trim();
      const catalog = addDetailLinks(readCanonicalCatalog(), family);
      return `<PaperLibrary spec="${encodeCatalog(JSON.stringify(catalog))}" />`;
    }

    if (token.info.trim() === "paper-lesson") {
      const lesson = buildPaperLessonSpec(token.content.trim());
      return `<PaperLessonMap spec="${encodeURIComponent(JSON.stringify(lesson))}" />`;
    }

    return fallback
      ? fallback(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
}
