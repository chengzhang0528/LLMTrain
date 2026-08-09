import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import DOMPurify from "dompurify";
import mermaid from "mermaid";
import { courseLessons, learningUnits, seriesPaperLessons, sidebar, topicLessons } from "../course-data.mjs";
import { validatePaperCatalog } from "../markdown/paper-library.mjs";
import { wikiAliases, wikiTerms } from "../wiki-terms.mjs";

// Mermaid sanitizes labels while parsing. In Node there is no DOM, so its
// DOMPurify factory has no browser methods; parsing does not emit HTML here.
DOMPurify.addHook ??= () => {};
DOMPurify.sanitize ??= (value) => value;

const root = process.cwd();
const contentRoots = [
  "README.md",
  "00-从这里开始",
  "01-14天理论课",
  "02-第3周实战",
  "03-数学急救包",
  "04-图解与数字漫画",
  "05-速查表",
  "06-拓展知识库",
  "07-来源与质量审计",
  "08-支持课程"
];

const supportImage = "public/support/alipay-reward.jpg";
const supportImageSha256 = "5708EC6CCD7034E541FEE162626616DAC46D647B80E27C9DB501CC1D368949C4";
const visualizationRuntimes = [
  {
    file: ".vitepress/vendor/rough.esm.js",
    sha256: "E921535F216EBC93D422489D614DA955B5286812220B3149FC70978F4CB5BD45"
  },
  {
    file: ".vitepress/vendor/three.module.min.js",
    sha256: "06552C54E4071FBC7305117AAFE6765D92C5D2A2A83507D4F05B9BF4F3D4D463"
  },
  {
    file: ".vitepress/vendor/three.core.min.js",
    sha256: "79F2B4F58D3E99A9948A4D3B7F6D5C2DAF705BDEFE9FB82EBEC715623966551C"
  }
];
const kimiK3Lessons = [
  "01-三维信息流全景.md",
  "02-KDA与混合注意力.md",
  "03-AttnRes与Stable-LatentMoE.md",
  "04-预训练长上下文与原生多模态.md",
  "05-后训练与可验证RL.md",
  "06-基础设施与评测.md"
];
const theoryOverviewPages = [
  ["01-14天理论课/模型原理总纲.md", "模型原理总纲"],
  ["01-14天理论课/模型架构总纲.md", "模型架构总纲"],
  ["01-14天理论课/模型训练总纲.md", "模型全生命周期总纲"]
];

async function collectMarkdown(entry) {
  const absolute = path.join(root, entry);
  const stat = await import("node:fs/promises").then(({ stat }) => stat(absolute));
  if (stat.isFile()) return absolute.endsWith(".md") ? [absolute] : [];

  const files = [];
  for (const item of await readdir(absolute, { withFileTypes: true })) {
    if (item.name === ".venv" || item.name === "outputs") continue;
    const child = path.join(absolute, item.name);
    if (item.isDirectory()) files.push(...(await collectMarkdown(path.relative(root, child))));
    else if (item.isFile() && item.name.endsWith(".md")) files.push(child);
  }
  return files;
}

function extractFences(source, relativePath) {
  const fences = [];
  const lines = source.split(/\r?\n/);
  let open = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!open) {
      const match = line.match(/^```([^\s]*)/);
      if (match) open = { language: match[1], start: index + 1, lines: [] };
      continue;
    }

    if (/^```\s*$/.test(line)) {
      fences.push({ ...open, content: open.lines.join("\n") });
      open = null;
    } else {
      open.lines.push(line);
    }
  }

  if (open) throw new Error(`${relativePath}:${open.start} 存在未闭合代码块`);
  return fences;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

const markdownFiles = (await Promise.all(contentRoots.map(collectMarkdown))).flat();
const errors = [];
let mermaidCount = 0;
let mathBlockCount = 0;
let exerciseCount = 0;
const stableExerciseIds = new Set();
let pencilFlowCount = 0;
let pencilVectorCount = 0;
let pencil3dCount = 0;
let modelRuntimeCount = 0;
let lessonBoardCount = 0;
let paperCount = 0;

const headingControlPattern = /[\u0000-\u001f]/g;
const headingSpecialPattern = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
const headingCombiningPattern = /[\u0300-\u036F]/g;

function stripFencedBlocks(source) {
  const lines = source.split(/\r?\n/);
  let fence = null;
  return lines
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (!fence && marker) {
        fence = marker[1][0];
        return "";
      }
      if (fence && new RegExp(`^\\s*\\${fence}{3,}`).test(line)) {
        fence = null;
        return "";
      }
      return fence ? "" : line;
    })
    .join("\n");
}

function headingSlug(title) {
  return title
    .normalize("NFKD")
    .replace(headingCombiningPattern, "")
    .replace(headingControlPattern, "")
    .replace(headingSpecialPattern, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1")
    .toLowerCase();
}

function collectDocumentAnchors(source) {
  const visibleSource = stripFencedBlocks(source);
  const anchors = new Set();
  const slugCounts = new Map();

  for (const match of visibleSource.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    anchors.add(match[1]);
  }

  for (const line of visibleSource.split(/\r?\n/)) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const title = match[1]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/[`*_~]/g, "")
      .trim();
    const base = headingSlug(title);
    if (!base) continue;
    const count = slugCounts.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    slugCounts.set(base, count + 1);
  }

  return anchors;
}

const markdownAnchorIndex = new Map();
for (const file of markdownFiles) {
  markdownAnchorIndex.set(path.resolve(file), collectDocumentAnchors(await readFile(file, "utf8")));
}

function validatePencilFence(fence, relativePath) {
  let spec;
  try {
    spec = JSON.parse(fence.content);
  } catch (error) {
    errors.push(`${relativePath}:${fence.start} ${fence.language} JSON 解析失败：${error.message}`);
    return;
  }

  const label = `${relativePath}:${fence.start} ${fence.language}`;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    errors.push(`${label} 必须是 JSON 对象`);
    return;
  }
  for (const field of ["ariaLabel", "learningGoal", "watchFor"]) {
    if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
  }
  if (spec.mode === "animated" && (!Array.isArray(spec.steps) || spec.steps.length < 2)) {
    errors.push(`${label} 动画模式至少需要 2 个 steps`);
  }

  if (fence.language === "pencil-flow") {
    pencilFlowCount += 1;
    const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
    const edges = Array.isArray(spec.edges) ? spec.edges : [];
    if (nodes.length < 2) errors.push(`${label} 至少需要 2 个 nodes`);
    const ids = new Set(nodes.map((node) => node.id));
    if (ids.size !== nodes.length || ids.has(undefined)) errors.push(`${label} node id 缺失或重复`);
    for (const edge of edges) {
      if (!edge.id || !ids.has(edge.from) || !ids.has(edge.to)) {
        errors.push(`${label} edge ${edge.id ?? "<missing>"} 引用了不存在的节点`);
      }
    }
    const markIds = new Set([...ids, ...edges.map((edge) => edge.id)]);
    for (const step of spec.steps ?? []) {
      if (![step.title, step.watch, step.purpose, step.detail, step.reflection].every((value) => String(value ?? "").trim()) || !Array.isArray(step.active)) {
        errors.push(`${label} 每个 step 都需要 title、watch、purpose、detail、reflection 与 active`);
      } else if (step.active.some((id) => !markIds.has(id))) {
        errors.push(`${label} step 引用了不存在的节点或边`);
      }
    }
  }

  if (fence.language === "pencil-vector") {
    pencilVectorCount += 1;
    const values = Array.isArray(spec.values) ? spec.values : [];
    if (values.length < 2 || values.length > 12 || values.some((value) => !Number.isFinite(value))) {
      errors.push(`${label} values 必须包含 2 到 12 个有限数值`);
    }
    for (const field of ["vectorName", "summary", "summaryNote"]) {
      if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
    }
    for (const step of spec.steps ?? []) {
      if (
        ![step.title, step.watch, step.purpose, step.detail, step.reflection, step.expression, step.annotation].every((value) => String(value ?? "").trim()) ||
        !Array.isArray(step.active)
      ) {
        errors.push(`${label} 每个 step 都需要教学说明、expression、annotation 与 active`);
        continue;
      }
      if (step.active.some((index) => !Number.isInteger(index) || index < 1 || index > values.length)) {
        errors.push(`${label} step.active 必须使用 1 到 ${values.length} 的数学下标`);
      }
      if (step.focus !== undefined && (!Number.isInteger(step.focus) || step.focus < 1 || step.focus > values.length)) {
        errors.push(`${label} step.focus 必须使用 1 到 ${values.length} 的数学下标`);
      }
    }
  }

  if (fence.language === "pencil-3d") {
    pencil3dCount += 1;
    const vectors = Array.isArray(spec.vectors) ? spec.vectors : [];
    if (!vectors.length) errors.push(`${label} 至少需要 1 个 vector`);
    const ids = new Set();
    for (const vector of vectors) {
      if (!vector.id || ids.has(vector.id)) errors.push(`${label} vector id 缺失或重复`);
      ids.add(vector.id);
      if (!Array.isArray(vector.value) || vector.value.length !== 3 || vector.value.some((value) => !Number.isFinite(value))) {
        errors.push(`${label} vector ${vector.id ?? "<missing>"} 必须包含 3 个有限数值`);
      }
    }
    for (const step of spec.steps ?? []) {
      if (![step.title, step.watch, step.purpose, step.detail, step.reflection].every((value) => String(value ?? "").trim()) || !Array.isArray(step.active)) {
        errors.push(`${label} 每个 step 都需要 title、watch、purpose、detail、reflection 与 active`);
      } else if (step.active.some((id) => !ids.has(id))) {
        errors.push(`${label} step 引用了不存在的 vector`);
      }
    }
  }

  if (fence.language === "model-runtime") {
    modelRuntimeCount += 1;
    if (!Array.isArray(spec.modes) || spec.modes.length < 1) {
      errors.push(`${label} 至少需要 1 个 mode`);
    } else {
      const modeIds = new Set();
      for (const mode of spec.modes) {
        if (!mode || typeof mode !== "object" || !String(mode.id ?? "").trim() || modeIds.has(mode.id)) {
          errors.push(`${label} mode id 缺失或重复`);
          continue;
        }
        modeIds.add(mode.id);
        for (const field of ["label", "overview"]) {
          if (!String(mode[field] ?? "").trim()) errors.push(`${label} mode ${mode.id} 缺少 ${field}`);
        }
        const nodes = Array.isArray(mode.nodes) ? mode.nodes : [];
        const edges = Array.isArray(mode.edges) ? mode.edges : [];
        const steps = Array.isArray(mode.steps) ? mode.steps : [];
        if (nodes.length < 2) errors.push(`${label} mode ${mode.id} 至少需要 2 个 nodes`);
        if (steps.length < 1) errors.push(`${label} mode ${mode.id} 至少需要 1 个 step`);
        const nodeIds = new Set();
        for (const node of nodes) {
          if (!node || typeof node !== "object" || !String(node.id ?? "").trim() || nodeIds.has(node.id)) {
            errors.push(`${label} mode ${mode.id} node id 缺失或重复`);
            continue;
          }
          nodeIds.add(node.id);
          for (const field of ["label", "shape", "kind"]) {
            if (!String(node[field] ?? "").trim()) errors.push(`${label} mode ${mode.id} node ${node.id} 缺少 ${field}`);
          }
        }
        const edgeIds = new Set();
        for (const edge of edges) {
          if (!edge || !String(edge.id ?? "").trim() || edgeIds.has(edge.id)) {
            errors.push(`${label} mode ${mode.id} edge id 缺失或重复`);
            continue;
          }
          edgeIds.add(edge.id);
          if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`${label} mode ${mode.id} edge ${edge.id} 引用了不存在的节点`);
        }
        const markIds = new Set([...nodeIds, ...edgeIds]);
        for (const step of steps) {
          const validStep = step && typeof step === "object" && ["title", "watch", "purpose", "detail", "reflection"].every((field) => String(step[field] ?? "").trim()) && Array.isArray(step.active);
          if (!validStep) errors.push(`${label} mode ${mode.id} 每个 step 都需要 title、watch、purpose、detail、reflection 与 active`);
          else if (step.active.some((id) => !markIds.has(id))) errors.push(`${label} mode ${mode.id} step 引用了不存在的节点或边`);
          if (step?.payload && typeof step.payload === "object") {
            for (const field of ["tokens", "ids", "positions", "values"]) {
              if (step.payload[field] !== undefined && (!Array.isArray(step.payload[field]) || step.payload[field].some((value) => typeof value !== "string"))) {
                errors.push(`${label} mode ${mode.id} step payload.${field} 必须是字符串数组`);
              }
            }
          }
        }
        if (mode.rebuild !== undefined && (!Array.isArray(mode.rebuild) || mode.rebuild.some((id) => !nodeIds.has(id)))) {
          errors.push(`${label} mode ${mode.id} rebuild 必须引用已有 node id`);
        }
      }
      if (spec.initialMode !== undefined && !modeIds.has(spec.initialMode)) errors.push(`${label} initialMode 引用了不存在的 mode`);
    }
  }
}

function validateLessonBoardFence(fence, relativePath) {
  lessonBoardCount += 1;
  let spec;
  try {
    spec = JSON.parse(fence.content);
  } catch (error) {
    errors.push(`${relativePath}:${fence.start} lesson-board JSON 解析失败：${error.message}`);
    return;
  }

  const label = `${relativePath}:${fence.start} lesson-board`;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    errors.push(`${label} 必须是 JSON 对象`);
    return;
  }
  for (const field of ["ariaLabel", "eyebrow", "title", "subtitle", "conclusion"]) {
    if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
  }

  const panels = Array.isArray(spec.panels) ? spec.panels : [];
  if (panels.length < 2) errors.push(`${label} 至少需要 2 个 panel`);
  const panelIds = new Set();
  for (const panel of panels) {
    if (!panel || typeof panel !== "object") {
      errors.push(`${label} panel 必须是对象`);
      continue;
    }
    if (!String(panel.id ?? "").trim() || panelIds.has(panel.id)) errors.push(`${label} panel id 缺失或重复`);
    panelIds.add(panel.id);
    for (const field of ["label", "title"]) {
      if (!String(panel[field] ?? "").trim()) errors.push(`${label} panel ${panel.id ?? "<未命名>"} 缺少 ${field}`);
    }
    if (panel.span !== undefined && (!Number.isInteger(panel.span) || panel.span < 1 || panel.span > 12)) {
      errors.push(`${label} panel ${panel.id ?? "<未命名>"} span 必须是 1 到 12 的整数`);
    }
    const hasRows = Array.isArray(panel.rows) && panel.rows.length > 0;
    const hasSteps = Array.isArray(panel.steps) && panel.steps.length > 0;
    const hasCompare = panel.compare && typeof panel.compare === "object";
    const hasCallout = panel.callout && typeof panel.callout === "object";
    if (!hasRows && !hasSteps && !hasCompare && !hasCallout) {
      errors.push(`${label} panel ${panel.id ?? "<未命名>"} 缺少内容`);
    }
    for (const row of panel.rows ?? []) {
      if (!String(row?.label ?? "").trim() || !String(row?.value ?? "").trim()) {
        errors.push(`${label} panel ${panel.id ?? "<未命名>"} 的 row 需要 label 和 value`);
      }
    }
    for (const step of panel.steps ?? []) {
      if (!String(step?.title ?? "").trim() || !String(step?.text ?? "").trim()) {
        errors.push(`${label} panel ${panel.id ?? "<未命名>"} 的 step 需要 title 和 text`);
      }
    }
    if (hasCompare) {
      const headers = Array.isArray(panel.compare.headers) ? panel.compare.headers : [];
      const rows = Array.isArray(panel.compare.rows) ? panel.compare.rows : [];
      if (headers.length < 2 || headers.some((item) => !String(item ?? "").trim()) || !rows.length) {
        errors.push(`${label} panel ${panel.id ?? "<未命名>"} 的 compare 需要标题和行`);
      }
      for (const row of rows) {
        if (!String(row?.label ?? "").trim() || !Array.isArray(row?.values) || row.values.length !== headers.length - 1 || row.values.some((item) => !String(item ?? "").trim())) {
          errors.push(`${label} panel ${panel.id ?? "<未命名>"} 的 compare 行与表头不匹配`);
        }
      }
    }
    if (hasCallout && (!String(panel.callout.label ?? "").trim() || !String(panel.callout.text ?? "").trim())) {
      errors.push(`${label} panel ${panel.id ?? "<未命名>"} 的 callout 需要 label 和 text`);
    }
  }

  const takeaways = Array.isArray(spec.takeaways) ? spec.takeaways : [];
  if (takeaways.length !== 4) errors.push(`${label} 必须提供 4 个 takeaways`);
  const takeawayNumbers = new Set();
  for (const item of takeaways) {
    if (!item || !["number", "title", "text"].every((field) => String(item[field] ?? "").trim())) {
      errors.push(`${label} 每个 takeaway 都需要 number、title 和 text`);
      continue;
    }
    if (takeawayNumbers.has(item.number)) errors.push(`${label} takeaway number 重复：${item.number}`);
    takeawayNumbers.add(item.number);
  }
}

for (const file of markdownFiles) {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");

  if (!relativePath.startsWith("07-来源与质量审计/") && source.includes("07-来源与质量审计")) {
    errors.push(`${relativePath}: 用户课程不得链接内部质量审计目录`);
  }

  if (/[锛鏄鍙�]/u.test(source)) {
    errors.push(`${relativePath}: 发现疑似乱码`);
  }

  let fences;
  try {
    fences = extractFences(source, relativePath);
  } catch (error) {
    errors.push(error.message);
    fences = [];
  }

  for (const fence of fences.filter((item) => item.language === "mermaid")) {
    mermaidCount += 1;
    try {
      await mermaid.parse(fence.content);
    } catch (error) {
      errors.push(`${relativePath}:${fence.start} Mermaid 解析失败：${error.message}`);
    }
  }

  for (const fence of fences.filter((item) => ["pencil-flow", "pencil-vector", "pencil-3d", "model-runtime"].includes(item.language))) {
    validatePencilFence(fence, relativePath);
  }

  for (const fence of fences.filter((item) => item.language === "lesson-board")) {
    validateLessonBoardFence(fence, relativePath);
  }

  for (const fence of fences.filter((item) => item.language === "paper-library")) {
    validatePaperLibraryFence(fence, relativePath);
  }

  const withoutCode = source.replace(/```[\s\S]*?```/g, "");
  if (/(^|\n)[^\n]*\[\s\][^\n]*(?=\n|$)/.test(withoutCode)) {
    errors.push(`${relativePath}: 出现不可操作的空白 Markdown 复选框；请改为普通审查要点或真实前端控件`);
  }
  if (/^#.*请填写名称/m.test(withoutCode)) {
    errors.push(`${relativePath}: 出现无法在站内保存的空白填写模板；请改为已填案例或真实前端交互`);
  }
  const mathDelimiters = withoutCode.match(/\$\$/g)?.length ?? 0;
  if (mathDelimiters % 2 !== 0) {
    errors.push(`${relativePath}: 块级公式 $$ 未成对`);
  }
  mathBlockCount += mathDelimiters / 2;

  for (const match of source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const authoredTarget = match[1].trim();
    if (/^(https?:\/\/|mailto:)/.test(authoredTarget)) continue;
    const hashIndex = authoredTarget.indexOf("#");
    const authoredPath = hashIndex >= 0 ? authoredTarget.slice(0, hashIndex) : authoredTarget;
    const authoredFragment = hashIndex >= 0 ? authoredTarget.slice(hashIndex + 1) : "";
    let target;
    let fragment;
    try {
      target = decodeURIComponent(authoredPath).replace(/^<|>$/g, "");
      fragment = decodeURIComponent(authoredFragment);
    } catch {
      errors.push(`${relativePath}: 链接包含无法解码的字符 -> ${authoredTarget}`);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), target || path.basename(file));
    if (!(await exists(resolved))) {
      errors.push(`${relativePath}: 本地链接不存在 -> ${target}`);
      continue;
    }
    if (fragment) {
      const linkedMarkdown = markdownAnchorIndex.has(resolved)
        ? resolved
        : markdownAnchorIndex.has(path.join(resolved, "README.md"))
          ? path.join(resolved, "README.md")
          : null;
      if (linkedMarkdown && !markdownAnchorIndex.get(linkedMarkdown).has(fragment)) {
        errors.push(`${relativePath}: 本地锚点不存在 -> ${authoredTarget}`);
      }
    }
  }
}

for (const lesson of courseLessons) {
  const lessonPath = path.join(root, lesson.source);
  if (!(await exists(lessonPath))) {
    errors.push(`课程清单缺少文件：${lesson.source}`);
    continue;
  }

  const source = await readFile(lessonPath, "utf8");
  if (!source.includes("> **学习导航**：")) {
    errors.push(`${lesson.source}: 缺少承接、本课任务与完成证据组成的学习导航`);
  }

  if (!/## (?:今日目标|今天完成)/.test(source)) {
    errors.push(`${lesson.source}: 缺少可观察的今日目标或今天完成清单`);
  }
  if (!source.includes("## 为什么要学这一课")) {
    errors.push(`${lesson.source}: 缺少从真实问题解释学习必要性的“为什么要学这一课”`);
  }
}

for (const relativePath of [
  "01-14天理论课/D01-大模型到底是什么.md",
  "01-14天理论课/D02-文字如何变成数字.md",
  "01-14天理论课/D05-注意力机制.md",
  "01-14天理论课/D06-拼出完整Transformer.md",
  "01-14天理论课/D07-模型如何生成文字.md"
]) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  if (!/^```lesson-board$/m.test(source)) errors.push(`${relativePath}: 缺少章节总览 lesson-board`);
}

for (const [relativePath, title] of theoryOverviewPages) {
  const overviewPath = path.join(root, relativePath);
  if (!(await exists(overviewPath))) {
    errors.push(`理论主线缺少总纲：${relativePath}`);
    continue;
  }
  const source = await readFile(overviewPath, "utf8");
  if (!/^# .*总纲$/m.test(source) || !source.includes(title)) errors.push(`${relativePath}: 标题必须明确总纲名称`);
  for (const marker of ["L0", "V=8", "D=4", "N=2", "H=2", "M=8", "T=4", "闭卷"]) {
    if (!source.includes(marker)) errors.push(`${relativePath}: 缺少统一教学模型或重建要求 ${marker}`);
  }
}

for (const lesson of courseLessons.filter((item) => item.phase === "理论")) {
  const source = await readFile(path.join(root, lesson.source), "utf8");
  if (!source.includes("> **主线位置**：")) errors.push(`${lesson.source}: D01-D14 必须在页首标出主线位置`);
  const overview = lesson.day <= 4 ? "模型原理总纲.md" : lesson.day <= 7 ? "模型架构总纲.md" : "模型训练总纲.md";
  if (!source.includes(`](${overview})`)) errors.push(`${lesson.source}: 主线位置必须链接到 ${overview}`);
}

const trainingLoopSource = await readFile(path.join(root, "01-14天理论课/D09-一次完整训练循环.md"), "utf8");
if (!trainingLoopSource.startsWith("# D09：训练任务内部的一次完整循环") || !trainingLoopSource.includes("## 先分清三个尺度")) {
  errors.push("D09 必须明确区分完整模型项目、一次训练任务和一个训练 step");
}

function vitePressSlugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1")
    .toLowerCase();
}

const learningSources = new Set();
const learningHrefs = new Set();
for (const unit of learningUnits) {
  if (!String(unit.source ?? "").trim() || !String(unit.href ?? "").trim()) {
    errors.push(`学习单元缺少 source 或 href：${unit.title ?? "<未命名>"}`);
    continue;
  }
  if (learningSources.has(unit.source)) errors.push(`学习单元 source 重复：${unit.source}`);
  if (learningHrefs.has(unit.href)) errors.push(`学习单元 href 重复：${unit.href}`);
  learningSources.add(unit.source);
  learningHrefs.add(unit.href);
  if (!(await exists(path.join(root, unit.source)))) {
    errors.push(`学习记录清单缺少文件：${unit.source}`);
  }
}

const visualSupportUnits = learningUnits.filter((unit) =>
  unit.source.startsWith("04-图解与数字漫画/")
);
for (const unit of visualSupportUnits) {
  const source = await readFile(path.join(root, unit.source), "utf8");
  const requiredSections = [
    ["> **学习导航**：", "缺少承接关系和可观察完成证据"],
    ["## 为什么要学这一页", "缺少学习必要性"],
    ["## 先预测", "缺少看前预测"],
    ["## 本页验收", "缺少迁移验收"],
    ["## 方法边界", "缺少简化条件和适用边界"]
  ];
  for (const [marker, message] of requiredSections) {
    if (!source.includes(marker)) errors.push(`${unit.source}: ${message}`);
  }
}

const progressPage = "00-从这里开始/学习记录与复习.md";
if (!(await exists(path.join(root, progressPage)))) {
  errors.push(`缺少学习记录页面：${progressPage}`);
} else {
  const progressSource = await readFile(path.join(root, progressPage), "utf8");
  if (!progressSource.includes("<LearningProgressCenter />")) {
    errors.push(`${progressPage}: 缺少 LearningProgressCenter`);
  }
  if (!progressSource.includes("当前浏览器")) {
    errors.push(`${progressPage}: 必须明确学习记录只保存在当前浏览器`);
  }
  if (!progressSource.includes("单元反思")) {
    errors.push(`${progressPage}: 必须说明单元反思与其他学习记录使用同一套浏览器状态`);
  }
}

const layoutComponent = await readFile(path.join(root, ".vitepress/theme/Layout.vue"), "utf8");
const docBeforeSlot = layoutComponent.match(/<template #doc-before>([\s\S]*?)<\/template>/)?.[1] ?? "";
const docFooterBeforeSlot = layoutComponent.match(/<template #doc-footer-before>([\s\S]*?)<\/template>/)?.[1] ?? "";
if (!docFooterBeforeSlot.includes("<LessonToolbar />")) {
  errors.push("课程完成操作必须放在正文末尾、上一课和下一课导航之前");
}
if (docBeforeSlot.includes("<LessonToolbar />")) {
  errors.push("课程开始位置不得再次出现完成学习操作");
}

for (const lesson of topicLessons) {
  const sourcePath = path.join(root, lesson.source);
  if (!(await exists(sourcePath))) {
    errors.push(`${lesson.source}: 专题课程单元文件不存在`);
    continue;
  }

  const source = await readFile(sourcePath, "utf8");
  if (!source.includes("> **学习导航**：")) {
    errors.push(`${lesson.source}: 缺少专题学习导航`);
  }
  if (!source.includes("## 本课目标")) {
    errors.push(`${lesson.source}: 缺少可观察的本课目标`);
  }
  if (!source.includes("## 为什么要学这一课")) {
    errors.push(`${lesson.source}: 缺少从真实问题解释学习必要性的章节`);
  }
  if (!source.includes("## 本课验收")) {
    errors.push(`${lesson.source}: 缺少专题单元验收问题`);
  }
  if (!source.includes("## 方法边界")) {
    errors.push(`${lesson.source}: 缺少方法边界`);
  }
}

const theoryCount = courseLessons.filter((lesson) => lesson.phase === "理论").length;
const caseCount = courseLessons.filter((lesson) => lesson.phase === "案例").length;
if (theoryCount !== 14 || caseCount !== 7) {
  errors.push(`基础闭环单元异常：理论 ${theoryCount}，案例 ${caseCount}`);
}

const expectedSidebarOrder = [
  "开始学习",
  "理论基础",
  "学习辅助（按需）",
  "训练过程案例",
  "实际模型案例",
  "模型后训练",
  "幻觉与可靠性",
  "小模型与蒸馏",
  "多模态基础",
  "软硬件瓶颈",
  "前沿与瓶颈",
  "论文研读",
  "速查表"
];
const actualSidebarOrder = sidebar.map((group) => group.text);
if (JSON.stringify(actualSidebarOrder) !== JSON.stringify(expectedSidebarOrder)) {
  errors.push(`一级目录未按推荐学习顺序排列：${actualSidebarOrder.join(" -> ")}`);
}
if (actualSidebarOrder.some((name) => name.includes("Kimi"))) {
  errors.push("具体模型名称不能作为一级课程目录，Kimi K3 应归入论文研读");
}
const startLinks = sidebar.find((group) => group.text === "开始学习")?.items?.map((item) => item.link) ?? [];
if (!startLinks.includes("/00-从这里开始/学习记录与复习")) {
  errors.push("开始学习目录必须提供学习记录与复习入口");
}
function collectSidebarLinks(items = []) {
  return items.flatMap((item) => [item.link, ...collectSidebarLinks(item.items)].filter(Boolean));
}

const allSidebarLinks = sidebar.flatMap((group) => collectSidebarLinks(group.items));
if (allSidebarLinks.some((link) => link.startsWith("/07-来源与质量审计"))) {
  errors.push("内部质量审计页面不得出现在用户课程侧栏");
}
const internalLearningUnit = learningUnits.find(
  (unit) => unit.source.startsWith("07-来源与质量审计/") || ["论文速研工作台", "论文证据卡", "审技术报告"].some((label) => unit.title.includes(label))
);
if (internalLearningUnit) {
  errors.push(`内部生产资料不得登记为学习单元：${internalLearningUnit.source}`);
}
const theorySidebar = sidebar.find((group) => group.text === "理论基础");
const expectedTheoryGroups = [
  "主线一 · 模型原理",
  "主线二 · 模型架构与运行",
  "主线三 · 数据准备与模型训练",
  "主线四 · 模型评估与优化",
  "主线五 · 推理、部署与应用",
  "主线六 · 监控、反馈与迭代",
  "专题拓展"
];
const actualTheoryGroups = theorySidebar?.items?.filter((item) => item.items).map((item) => item.text) ?? [];
if (JSON.stringify(actualTheoryGroups) !== JSON.stringify(expectedTheoryGroups)) {
  errors.push(`理论基础目录没有按六段主线与专题层组织：${actualTheoryGroups.join(" -> ")}`);
}
for (const [relativePath] of theoryOverviewPages) {
  const href = `/${relativePath.replace(/\.md$/, "")}`;
  if (!allSidebarLinks.includes(href)) errors.push(`理论基础侧栏缺少总纲入口：${href}`);
}
for (const obsoleteLink of [
  "/00-从这里开始/每日打卡表",
  "/02-第3周实战/数据卡模板",
  "/02-第3周实战/模型卡模板"
]) {
  if (allSidebarLinks.includes(obsoleteLink)) {
    errors.push(`侧栏不得恢复无法操作的旧入口：${obsoleteLink}`);
  }
}

const preparedCaseLessons = courseLessons.filter((lesson) => lesson.phase === "案例");
for (const lesson of preparedCaseLessons) {
  const source = await readFile(path.join(root, lesson.source), "utf8");
  if (!source.includes("预设案例") && !source.includes("预生成")) {
    errors.push(`${lesson.source}: 训练过程案例必须明确使用预设或预生成材料`);
  }
  if (/```(?:powershell|bash|sh)\b/.test(source)) {
    errors.push(`${lesson.source}: 课程案例不得要求学习者执行命令`);
  }
}

function validatePaperLibraryFence(fence, relativePath) {
  let catalog;
  try {
    catalog = JSON.parse(fence.content);
  } catch (error) {
    errors.push(`${relativePath}:${fence.start} paper-library JSON 解析失败：${error.message}`);
    return;
  }
  const label = `${relativePath}:${fence.start} paper-library`;
  const papers = Array.isArray(catalog?.papers) ? catalog.papers : [];
  for (const issue of validatePaperCatalog(catalog)) errors.push(`${label} ${issue}`);
  const ids = new Set();
  const families = new Set();
  const requiredIds = ["glm-5", "kimi-k3", "deepseek-r1", "qwen3"];
  if (papers.length < 50) errors.push(`${label} 至少应收录 50 篇或版本记录，实际 ${papers.length}`);
  for (const [index, paper] of papers.entries()) {
    const entryLabel = `${label} 第 ${index + 1} 项`;
    if (!paper || typeof paper !== "object") {
      errors.push(`${entryLabel} 必须是对象`);
      continue;
    }
    if (!paper.id || ids.has(paper.id)) errors.push(`${entryLabel} id 缺失或重复`);
    ids.add(paper.id);
    families.add(paper.family);
    paperCount += 1;
  }
  for (const family of ["GLM", "Kimi", "DeepSeek", "Qwen"]) {
    if (!families.has(family)) errors.push(`${label} 缺少 ${family} 系列`);
  }
  for (const id of requiredIds) {
    if (!ids.has(id)) errors.push(`${label} 缺少主干条目 ${id}`);
  }
}

const normalizedWikiAliases = new Set(
  wikiAliases.map(({ alias }) => alias.toLocaleLowerCase("en-US"))
);
const englishCompoundPattern = /\*\*([A-Za-z][A-Za-z0-9@+./-]*(?:\s+[A-Za-z][A-Za-z0-9@+./-]*)+)\*\*/g;

for (const file of markdownFiles) {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");
  for (const forbiddenHeading of ["## 动手任务", "## 动手产物", "## 环境安装"]) {
    if (source.includes(forbiddenHeading)) {
      errors.push(`${relativePath}: 纯浏览器课程不得包含实操标题 ${forbiddenHeading}`);
    }
  }

  for (const match of source.matchAll(englishCompoundPattern)) {
    const compound = match[1].replace(/\s+/g, " ").trim();
    const normalized = compound.toLocaleLowerCase("en-US");
    if (normalizedWikiAliases.has(normalized)) continue;

    const containsKnownTerm = wikiAliases.some(({ alias }) => {
      if (!/[A-Za-z]/.test(alias)) return false;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, "i").test(compound);
    });
    if (containsKnownTerm) {
      errors.push(`${relativePath}: 加粗复合术语“${compound}”只登记了部分词，请登记完整术语或取消术语式加粗`);
    }
  }
}

const paperReadingGroup = sidebar.find((group) => group.text === "论文研读");
const paperReadingLinks = collectSidebarLinks(paperReadingGroup?.items);
const expectedPaperSections = ["按研究问题学习", "按模型系列学习", "跨系列专题"];
const actualPaperSections = paperReadingGroup?.items?.filter((item) => item.items).map((item) => item.text) ?? [];
if (JSON.stringify(actualPaperSections) !== JSON.stringify(expectedPaperSections)) {
  errors.push(`论文研读目录没有把问题索引、模型系列和跨系列专题分清：${actualPaperSections.join(" -> ")}`);
}
if (
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/03-如何读懂一篇论文") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/01-论文库") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/02-跨系列问题地图") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/04-GLM系列演进") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/05-Kimi系列演进") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/06-DeepSeek系列演进") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/07-Qwen系列演进") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/GLM深读/论文") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/Kimi深读/论文") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/DeepSeek深读/论文") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/Qwen深读/论文") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/Kimi深读/06-Kimi-K3技术报告")
) {
  errors.push("论文研读目录必须包含知识图谱，并在四个模型系列内同时提供系列路线、论文目录和逐篇课程；Kimi K3 必须收在 Kimi 系列中");
}

for (const lesson of courseLessons.filter((item) => item.phase === "理论")) {
  const source = await readFile(path.join(root, lesson.source), "utf8");
  const section = source.match(/## (?:今日验收|结业验收)\s*([\s\S]*?)(?=\n## |\n来源：|\n下一课：|$)/)?.[1] ?? "";
  const exercises = section.match(/<ExerciseBlock\b[\s\S]*?\/>/g) ?? [];
  exerciseCount += exercises.length;

  if (exercises.length !== 6) {
    errors.push(`${lesson.source}: 理论课验收应包含 6 道 ExerciseBlock，实际 ${exercises.length} 道`);
  }

  const types = new Set();
  for (const [index, exercise] of exercises.entries()) {
    const label = `${lesson.source}: 第 ${index + 1} 道验收题`;
    const type = exercise.match(/\btype="(qa|choice|calculation)"/)?.[1];
    if (type) types.add(type);
    else errors.push(`${label} 缺少有效 type`);

    for (const prop of ["question", "answer", "mistake"]) {
      if (!new RegExp(`\\b${prop}="[^"]+"`).test(exercise)) {
        errors.push(`${label} 缺少 ${prop}`);
      }
    }

    const steps = exercise.match(/:steps="\[([\s\S]*?)\]"/)?.[1].match(/'[^']+'/g) ?? [];
    if (steps.length < 3) errors.push(`${label} 至少需要 3 个详细推理步骤`);

    if (lesson.day >= 2 && lesson.day <= 7) {
      const id = exercise.match(/\bid="([a-z0-9-]+)"/)?.[1];
      if (!id) errors.push(`${label} 缺少稳定的小写 ASCII id`);
      else if (stableExerciseIds.has(id)) errors.push(`${label} 的 id ${id} 与其他题重复`);
      else stableExerciseIds.add(id);
      for (const prop of ["concepts", "misconceptions", "remediation", "transfer"]) {
        if (!new RegExp(`:${prop}="`).test(exercise)) {
          errors.push(`${label} 缺少掌握闭环元数据 ${prop}`);
        }
      }
      const transfer = exercise.match(/:transfer="\{([\s\S]*?)\}"/)?.[1] ?? "";
      for (const field of ["question", "options", "correct", "explanation"]) {
        if (!new RegExp(`\\b${field}:`).test(transfer)) {
          errors.push(`${label} 的迁移题缺少 ${field}`);
        }
      }
      const transferOptions = transfer.match(/options:\s*\[([\s\S]*?)\]/)?.[1].match(/'[^']+'/g) ?? [];
      const transferCorrect = transfer.match(/correct:\s*'([A-D])'/)?.[1] ?? "";
      if (transferOptions.length < 2) errors.push(`${label} 的迁移题至少需要 2 个选项`);
      if (transferCorrect && transferCorrect.charCodeAt(0) - 65 >= transferOptions.length) {
        errors.push(`${label} 的迁移题正确项 ${transferCorrect} 超出选项范围`);
      }
      const remediation = exercise.match(/:remediation="\{([\s\S]*?)\}"/)?.[1] ?? "";
      const remediationHref = remediation.match(/\bhref:\s*'([^']+)'/)?.[1];
      const remediationTitle = remediation.match(/\btitle:\s*'([^']+)'/)?.[1];
      if (remediationHref && remediationTitle) {
        const expectedHref = `#${vitePressSlugify(remediationTitle)}`;
        if (remediationHref !== expectedHref) {
          errors.push(`${label} 的补救锚点应为 ${expectedHref}，实际 ${remediationHref}`);
        }
        const headingExists = source.split(/\r?\n/).some((line) =>
          /^#{2,3}\s+/.test(line) && line.replace(/^#{2,3}\s+/, "").trim() === remediationTitle
        );
        if (!headingExists) errors.push(`${label} 的补救标题在本课中不存在：${remediationTitle}`);
      }
    }

    if (type === "choice") {
      const options = exercise.match(/:options="\[([\s\S]*?)\]"/)?.[1].match(/'[^']+'/g) ?? [];
      if (options.length < 3) errors.push(`${label} 选择题至少需要 3 个选项`);
      const multiple = /\bmultiple(?:\s|=)/.test(exercise);
      const correct = exercise.match(/\bcorrect="([A-D,]+)"/)?.[1] ?? "";
      const correctLetters = [...new Set(correct.match(/[A-D]/g) ?? [])];
      if (multiple && correctLetters.length < 2) errors.push(`${label} 多选题至少需要 2 个正确项`);
      if (!multiple && correctLetters.length !== 1) errors.push(`${label} 单选题需要 1 个 A-D 范围内的正确项`);
      if (correctLetters.some((letter) => letter.charCodeAt(0) - 65 >= options.length)) {
        errors.push(`${label} 正确项超出选项范围：${correctLetters.join(",")}`);
      }

      const answer = exercise.match(/\banswer="([^"]+)"/)?.[1] ?? "";
      const answerPrefix = answer.match(/^\s*([A-D](?:\s*[,，、/]\s*[A-D])*)[。.:：，,]/)?.[1];
      if (answerPrefix) {
        const answerLetters = [...new Set(answerPrefix.match(/[A-D]/g) ?? [])].sort();
        const expectedLetters = [...correctLetters].sort();
        if (JSON.stringify(answerLetters) !== JSON.stringify(expectedLetters)) {
          errors.push(`${label} correct=${correct} 与答案开头 ${answerPrefix} 不一致`);
        }
      }
    }
  }

  for (const type of ["qa", "choice", "calculation"]) {
    if (!types.has(type)) errors.push(`${lesson.source}: 验收缺少 ${type} 题型`);
  }
}

if (exerciseCount !== 84) errors.push(`理论课交互题总数应为 84，实际 ${exerciseCount}`);

const exerciseComponent = await readFile(path.join(root, ".vitepress/theme/components/ExerciseBlock.vue"), "utf8");
for (const removedPattern of ["10 秒答案", "逐步理解", "exercise-detail-toggle"]) {
  if (exerciseComponent.includes(removedPattern)) {
    errors.push(`ExerciseBlock 不应恢复已移除的二次展开交互：${removedPattern}`);
  }
}

for (const sourcePath of [
  "01-14天理论课/D01-大模型到底是什么.md",
  "01-14天理论课/D02-文字如何变成数字.md",
  "01-14天理论课/D03-够用就好的数学基础.md"
]) {
  const source = await readFile(path.join(root, sourcePath), "utf8");
  if (!source.includes(":transfer=")) errors.push(`${sourcePath}: 首批吸收样板缺少迁移检查`);
}

if (pencilFlowCount < 2 || pencilVectorCount < 1 || pencil3dCount < 1) {
  errors.push(`铅笔视图不足：二维流程 ${pencilFlowCount}，向量 ${pencilVectorCount}，三维 ${pencil3dCount}`);
}

for (const [sourcePath, fence] of [
  ["01-14天理论课/D01-大模型到底是什么.md", "pencil-flow"],
  ["01-14天理论课/D02-文字如何变成数字.md", "pencil-flow"],
  ["01-14天理论课/D03-够用就好的数学基础.md", "pencil-flow"],
  ["01-14天理论课/D03-够用就好的数学基础.md", "pencil-vector"],
  ["01-14天理论课/D07-模型如何生成文字.md", "pencil-flow"],
  ["00-从这里开始/全局知识图谱.md", "model-runtime"],
  ["01-14天理论课/D02-文字如何变成数字.md", "model-runtime"],
  ["01-14天理论课/D06-拼出完整Transformer.md", "model-runtime"],
  ["01-14天理论课/D07-模型如何生成文字.md", "model-runtime"],
  ["06-拓展知识库/论文研读/Kimi深读/06-Kimi-K3技术报告/01-三维信息流全景.md", "pencil-3d"]
]) {
  const source = await readFile(path.join(root, sourcePath), "utf8");
  if (!source.includes(`\`\`\`${fence}`)) errors.push(`${sourcePath}: 动效审计要求保留 ${fence}`);
}

const glossary = await readFile(path.join(root, "05-速查表/术语速查.md"), "utf8");
const anchors = new Set();
for (const term of wikiTerms) {
  if (anchors.has(term.anchor)) errors.push(`Wiki 锚点重复：${term.anchor}`);
  anchors.add(term.anchor);

  if (term.href !== `/05-速查表/术语速查#${term.anchor}`) {
    errors.push(`Wiki 目标异常：${term.term} -> ${term.href}`);
  }
  if (!glossary.includes(`id="${term.anchor}"`)) {
    errors.push(`术语速查缺少锚点：${term.anchor}`);
  }
  if (!term.summary.trim() || !term.misconception.trim()) {
    errors.push(`Wiki 预览内容不完整：${term.term}`);
  }
  if (!/^\/.+\/$/.test(String(term.pronunciation ?? ""))) {
    errors.push(`Wiki 术语缺少有效音标：${term.term}`);
  }
  if (!String(term.speech ?? "").trim()) {
    errors.push(`Wiki 术语缺少朗读文本：${term.term}`);
  }
  if (!/^\/pronunciation\/[a-z0-9-]+\.wav$/i.test(String(term.audio ?? ""))) {
    errors.push(`Wiki 术语离线音频路径异常：${term.term}`);
  } else if (!(await exists(path.join(root, "public", term.audio.replace(/^\//, ""))))) {
    errors.push(`Wiki 术语缺少离线音频：${term.term}`);
  }
  if (term.maxLinksPerPage !== null && (!Number.isInteger(term.maxLinksPerPage) || term.maxLinksPerPage < 1)) {
    errors.push(`Wiki 每页链接上限异常：${term.term}`);
  }
  if (term.visual && !["pipeline", "vector", "bars"].includes(term.visual.type)) {
    errors.push(`Wiki 视觉类型异常：${term.term}`);
  }
}

const runtimeLesson = await readFile(path.join(root, "01-14天理论课/D07-模型如何生成文字.md"), "utf8");
const runtimeFlowCount = runtimeLesson.match(/```pencil-flow/g)?.length ?? 0;
if (runtimeFlowCount < 2 || !runtimeLesson.includes("prefill") || !runtimeLesson.includes("decode")) {
  errors.push("D07 必须用至少两段流程动效串起端到端运行、prefill 和 decode");
}

const aliases = new Map();
for (const { alias, term } of wikiAliases) {
  const normalized = alias.toLocaleLowerCase("en-US");
  const existing = aliases.get(normalized);
  if (existing && existing !== term.term) {
    errors.push(`Wiki 别名冲突：${alias} 同时指向 ${existing} 和 ${term.term}`);
  }
  aliases.set(normalized, term.term);
}

for (const lesson of kimiK3Lessons) {
  const relativePath = `06-拓展知识库/论文研读/Kimi深读/06-Kimi-K3技术报告/${lesson}`;
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const level of ["L1", "L2", "L3", "L4"]) {
    const count = source.match(new RegExp(`\\*\\*${level}\\b`, "g"))?.length ?? 0;
    if (count !== 1) errors.push(`${relativePath}: ${level} 练习应恰好出现一次，实际 ${count} 次`);
  }
  const answerCount = source.match(/<details><summary>/g)?.length ?? 0;
  if (answerCount !== 4) errors.push(`${relativePath}: 应包含 4 个可展开参考答案，实际 ${answerCount} 个`);
  if (!source.includes("https://arxiv.org/abs/2607.24653")) {
    errors.push(`${relativePath}: 缺少 Kimi K3 一手技术报告来源`);
  }
}

const kimiK3Audit = await readFile(
  path.join(root, "07-来源与质量审计/Kimi-K3-素材审计.md"),
  "utf8"
);
for (const label of ["一手事实", "作者实验", "作者主张", "教学推导", "工程估算", "待核查"]) {
  if (!kimiK3Audit.includes(`| ${label} |`)) errors.push(`Kimi K3 素材审计缺少证据标签：${label}`);
}

if (!(await exists(path.join(root, supportImage)))) {
  errors.push(`缺少原样打赏图片：${supportImage}`);
} else {
  const actualHash = createHash("sha256")
    .update(await readFile(path.join(root, supportImage)))
    .digest("hex")
    .toUpperCase();
  if (actualHash !== supportImageSha256) {
    errors.push(`打赏图片不是原始文件：${supportImage}`);
  }
}

for (const runtime of visualizationRuntimes) {
  const target = path.join(root, runtime.file);
  if (!(await exists(target))) {
    errors.push(`缺少离线可视化运行时：${runtime.file}`);
    continue;
  }
  const normalizedRuntime = Buffer.from(
    (await readFile(target, "utf8")).replace(/\r\n/g, "\n"),
    "utf8"
  );
  const actualHash = createHash("sha256")
    .update(normalizedRuntime)
    .digest("hex")
    .toUpperCase();
  if (actualHash !== runtime.sha256) errors.push(`可视化运行时哈希异常：${runtime.file}`);
}

for (const lesson of seriesPaperLessons) {
  const relativePath = lesson.source;
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const level of ["L1", "L2", "L3", "L4"]) {
    const count = source.match(new RegExp(`\\*\\*${level}\\b`, "g"))?.length ?? 0;
    if (count !== 1) errors.push(`${relativePath}: ${level} 练习应恰好出现一次，实际 ${count} 次`);
  }
  const answerCount = source.match(/<details><summary>/g)?.length ?? 0;
  if (answerCount !== 4) errors.push(`${relativePath}: 应包含 4 个可展开参考答案，实际 ${answerCount} 个`);
  if (!source.includes("## 论文回答什么") || !source.includes("## 训练与推理分开")) {
    errors.push(`${relativePath}: 缺少真实问题或训练/推理拆分章节`);
  }
  if (!source.includes("## 数字证据账本") || !source.includes("## 代价与边界")) {
    errors.push(`${relativePath}: 缺少数字证据或代价边界章节`);
  }
  if (!/https:\/\/(?:arxiv\.org|github\.com)\//.test(source)) {
    errors.push(`${relativePath}: 缺少论文或官方报告来源链接`);
  }
  const memoryFences = [...source.matchAll(/```paper-lesson\s*\n([^\n]+)\s*\n```/g)].map((match) => match[1].trim());
  if (memoryFences.length !== 1 || memoryFences[0] !== lesson.paperId) {
    errors.push(`${relativePath}: 必须包含与论文库 ID 对应的唯一 paper-lesson 认知骨架`);
  }
}

for (const [family, slug] of [
  ["GLM", "GLM深读"],
  ["Kimi", "Kimi深读"],
  ["DeepSeek", "DeepSeek深读"],
  ["Qwen", "Qwen深读"]
]) {
  const directoryPath = path.join(root, `06-拓展知识库/论文研读/${slug}/论文.md`);
  const detailPath = path.join(root, `06-拓展知识库/论文研读/${slug}/论文详情.md`);
  const directorySource = await readFile(directoryPath, "utf8");
  const detailSource = await readFile(detailPath, "utf8");
  if (!directorySource.includes(`~~~paper-family\n${family}\n~~~`)) {
    errors.push(`${path.relative(root, directoryPath)}: 缺少完整系列目录入口`);
  }
  if (!detailSource.includes(`~~~paper-family-detail\n${family}\n~~~`)) {
    errors.push(`${path.relative(root, detailPath)}: 缺少单篇论文研读入口`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `内容检查通过：${markdownFiles.length} 篇 Markdown，` +
  `${mermaidCount} 个 Mermaid 图，${pencilFlowCount} 个二维流程图，${pencilVectorCount} 个向量图，` +
  `${pencil3dCount} 个三维铅笔图，${modelRuntimeCount} 个统一运行地图，${lessonBoardCount} 个章节总览看板，${mathBlockCount} 个块级公式，` +
  `${courseLessons.length} 个基础闭环单元，${topicLessons.length} 个专题单元，${learningUnits.length} 个进度单元，${exerciseCount} 道交互题，` +
  `${wikiTerms.length} 个 Wiki 术语，${paperCount} 篇论文/版本记录，打赏原图校验通过。`
);
