import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import DOMPurify from "dompurify";
import mermaid from "mermaid";
import { courseLessons } from "../course-data.mjs";
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
  "01-先学会审技术报告.md",
  "02-三维信息流全景.md",
  "03-KDA与混合注意力.md",
  "04-AttnRes与Stable-LatentMoE.md",
  "05-预训练长上下文与原生多模态.md",
  "06-后训练与可验证RL.md",
  "07-基础设施与评测.md"
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
let pencilFlowCount = 0;
let pencil3dCount = 0;

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
}

for (const file of markdownFiles) {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");

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

  for (const fence of fences.filter((item) => item.language === "pencil-flow" || item.language === "pencil-3d")) {
    validatePencilFence(fence, relativePath);
  }

  const withoutCode = source.replace(/```[\s\S]*?```/g, "");
  const mathDelimiters = withoutCode.match(/\$\$/g)?.length ?? 0;
  if (mathDelimiters % 2 !== 0) {
    errors.push(`${relativePath}: 块级公式 $$ 未成对`);
  }
  mathBlockCount += mathDelimiters / 2;

  for (const match of source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (/^(https?:\/\/|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.split("#")[0]).replace(/^<|>$/g, "");
    const resolved = path.resolve(path.dirname(file), target);
    if (!(await exists(resolved))) {
      errors.push(`${relativePath}: 本地链接不存在 -> ${target}`);
    }
  }
}

for (const lesson of courseLessons) {
  if (!(await exists(path.join(root, lesson.source)))) {
    errors.push(`课程清单缺少文件：${lesson.source}`);
  }
}

const theoryCount = courseLessons.filter((lesson) => lesson.phase === "理论").length;
const practiceCount = courseLessons.filter((lesson) => lesson.phase === "实践").length;
if (theoryCount !== 14 || practiceCount !== 7) {
  errors.push(`课程天数异常：理论 ${theoryCount}，实践 ${practiceCount}`);
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

    if (type === "choice") {
      const options = exercise.match(/:options="\[([\s\S]*?)\]"/)?.[1].match(/'[^']+'/g) ?? [];
      if (options.length < 3) errors.push(`${label} 选择题至少需要 3 个选项`);
      const multiple = /\bmultiple(?:\s|=)/.test(exercise);
      const correct = exercise.match(/\bcorrect="([A-D,]+)"/)?.[1] ?? "";
      const correctLetters = [...new Set(correct.match(/[A-D]/g) ?? [])];
      if (multiple && correctLetters.length < 2) errors.push(`${label} 多选题至少需要 2 个正确项`);
      if (!multiple && correctLetters.length !== 1) errors.push(`${label} 单选题需要 1 个 A-D 范围内的正确项`);
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

if (pencilFlowCount < 2 || pencil3dCount < 1) {
  errors.push(`铅笔视图不足：二维 ${pencilFlowCount}，三维 ${pencil3dCount}`);
}

for (const [sourcePath, fence] of [
  ["01-14天理论课/D01-大模型到底是什么.md", "pencil-flow"],
  ["01-14天理论课/D02-文字如何变成数字.md", "pencil-flow"],
  ["01-14天理论课/D03-够用就好的数学基础.md", "pencil-flow"],
  ["01-14天理论课/D07-模型如何生成文字.md", "pencil-flow"],
  ["06-拓展知识库/Kimi-K3深读/02-三维信息流全景.md", "pencil-3d"]
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
  const relativePath = `06-拓展知识库/Kimi-K3深读/${lesson}`;
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
  const actualHash = createHash("sha256")
    .update(await readFile(target))
    .digest("hex")
    .toUpperCase();
  if (actualHash !== runtime.sha256) errors.push(`可视化运行时哈希异常：${runtime.file}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `内容检查通过：${markdownFiles.length} 篇 Markdown，` +
  `${mermaidCount} 个 Mermaid 图，${pencilFlowCount} 个二维铅笔图，` +
  `${pencil3dCount} 个三维铅笔图，${mathBlockCount} 个块级公式，` +
  `${courseLessons.length} 天课程，${exerciseCount} 道交互题，` +
  `${wikiTerms.length} 个 Wiki 术语，打赏原图校验通过。`
);
