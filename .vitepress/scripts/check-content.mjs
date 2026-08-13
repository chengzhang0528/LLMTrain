import { access, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import DOMPurify from "dompurify";
import mermaid from "mermaid";
import {
  algorithmLessons,
  courseLessons,
  learningUnits,
  paperSurveyLessons,
  primaryNav,
  seriesPaperCourses,
  seriesPaperLessons,
  sidebar,
  topicCourses,
  topicLessons
} from "../course-data.mjs";
import { buildPaperDetailPaths, validatePaperCatalog } from "../markdown/paper-library.mjs";
import { wikiAliases, wikiTerms } from "../wiki-terms.mjs";

// Mermaid sanitizes labels while parsing. In Node there is no DOM, so its
// DOMPurify factory has no browser methods; parsing does not emit HTML here.
DOMPurify.addHook ??= () => {};
DOMPurify.sanitize ??= (value) => value;

const repoRoot = process.cwd();
const root = path.join(repoRoot, "course");
const contentRoots = [
  "README.md",
  "00-从这里开始",
  "01-14天理论课",
  "02-第3周实战",
  "03-数学急救包",
  "04-图解与数字漫画",
  "05-速查表",
  "06-拓展知识库",
  "08-支持课程",
  "09-模型算法图解"
];

const supportImage = "public/support/alipay-reward.jpg";
const supportImagePath = path.join(repoRoot, supportImage);
const supportImageSha256 = "5708EC6CCD7034E541FEE162626616DAC46D647B80E27C9DB501CC1D368949C4";
const algorithmDecisionComponent = ".vitepress/theme/components/AlgorithmDecisionFloat.vue";
const feedbackComponent = ".vitepress/theme/components/FeedbackFloat.vue";
const feedbackWorker = "worker/feedback.mjs";
const feedbackWorkerConfig = "wrangler.jsonc";
const runtimeVisualKinds = new Set([
  "message",
  "modalities",
  "sequence",
  "tensor",
  "cache",
  "scores",
  "selection",
  "output",
  "operation",
  "scalar",
  "gradient",
  "parameter-update",
  "checkpoint",
  "metrics"
]);
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
const l0ConfigurationMarkers = ["L0", "V=8", "D=4", "N=2", "H=2", "D_h=2", "M=8", "T=4"];

async function collectMarkdownTree(absolute) {
  const metadata = await stat(absolute);
  if (metadata.isFile()) return absolute.endsWith(".md") ? [absolute] : [];

  const files = [];
  for (const item of await readdir(absolute, { withFileTypes: true })) {
    if (item.name === ".venv" || item.name === "outputs") continue;
    const child = path.join(absolute, item.name);
    if (item.isDirectory()) files.push(...(await collectMarkdownTree(child)));
    else if (item.isFile() && item.name.endsWith(".md")) files.push(child);
  }
  return files;
}

async function collectMarkdown(entry) {
  return collectMarkdownTree(path.join(root, entry));
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
const repositoryDocumentationFiles = [
  path.join(repoRoot, "README.md"),
  path.join(repoRoot, "AGENTS.md"),
  ...(await collectMarkdownTree(path.join(repoRoot, "internal")))
];
const repositoryMarkdownCount = markdownFiles.length + repositoryDocumentationFiles.length;
const errors = [];
let mermaidCount = 0;
let mathBlockCount = 0;
let formulaStoryCount = 0;
let exerciseCount = 0;
const stableExerciseIds = new Set();
let pencilFlowCount = 0;
let pencilVectorCount = 0;
let pencilFormulaPlaneCount = 0;
let pencil3dCount = 0;
let modelRuntimeCount = 0;
let tokenComputeTowerCount = 0;
let lessonBoardCount = 0;
let generationRoadmapCount = 0;
let benchmarkChartCount = 0;
let benchmarkLeaderboardCount = 0;
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
for (const file of [...markdownFiles, ...repositoryDocumentationFiles]) {
  markdownAnchorIndex.set(path.resolve(file), collectDocumentAnchors(await readFile(file, "utf8")));
}

async function validateLocalMarkdownLinks(file, source, relativePath) {
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

  if (fence.language === "pencil-formula-plane") {
    pencilFormulaPlaneCount += 1;
    for (const field of ["summary", "summaryNote", "boundary"]) {
      if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
    }
    const axes = spec.axes && typeof spec.axes === "object" ? spec.axes : {};
    for (const field of ["xLabel", "yLabel"]) {
      if (!String(axes[field] ?? "").trim()) errors.push(`${label} axes 缺少 ${field}`);
    }
    for (const field of ["xRange", "yRange"]) {
      const range = axes[field];
      if (
        !Array.isArray(range) ||
        range.length !== 2 ||
        range.some((value) => !Number.isFinite(value)) ||
        range[0] >= range[1] ||
        range[0] > 0 ||
        range[1] < 0
      ) {
        errors.push(`${label} axes.${field} 必须是包含原点的递增有限数值区间`);
      }
    }
    const vectors = Array.isArray(spec.vectors) ? spec.vectors : [];
    if (vectors.length < 2 || vectors.length > 4) errors.push(`${label} vectors 必须包含 2 到 4 个二维向量`);
    const vectorIds = new Set();
    for (const vector of vectors) {
      if (!String(vector.id ?? "").trim() || vectorIds.has(vector.id)) errors.push(`${label} vector id 缺失或重复`);
      vectorIds.add(vector.id);
      if (!String(vector.label ?? "").trim()) errors.push(`${label} vector ${vector.id ?? "<missing>"} 缺少 label`);
      if (!Array.isArray(vector.value) || vector.value.length !== 2 || vector.value.some((value) => !Number.isFinite(value))) {
        errors.push(`${label} vector ${vector.id ?? "<missing>"} 必须包含 2 个有限数值`);
      }
    }
    const links = Array.isArray(spec.links) ? spec.links : [];
    if (!links.length) errors.push(`${label} 至少需要 1 条公式对应连线`);
    const linkIds = new Set();
    for (const link of links) {
      if (!String(link.id ?? "").trim() || linkIds.has(link.id)) errors.push(`${label} link id 缺失或重复`);
      linkIds.add(link.id);
      if (![link.label, link.expression].every((value) => String(value ?? "").trim())) {
        errors.push(`${label} 每条 link 都需要 label 与 expression`);
      }
    }
    const markIds = new Set(["axes", "angle", ...vectorIds, ...linkIds]);
    for (const vectorId of vectorIds) {
      markIds.add(`${vectorId}:x`);
      markIds.add(`${vectorId}:y`);
    }
    for (const step of spec.steps ?? []) {
      if (
        ![step.title, step.focus, step.watch, step.purpose, step.detail, step.reflection, step.expression, step.annotation]
          .every((value) => String(value ?? "").trim()) ||
        !Array.isArray(step.active)
      ) {
        errors.push(`${label} 每个 step 都需要教学说明、focus、expression、annotation 与 active`);
      } else if (step.active.some((id) => !markIds.has(id))) {
        errors.push(`${label} step 引用了不存在的向量、分量、夹角或公式连线`);
      }
    }
  }

  if (fence.language === "pencil-3d") {
    pencil3dCount += 1;
    if (!String(spec.boundary ?? "").trim()) errors.push(`${label} 缺少 boundary`);
    if (!["numeric-vector", "categorical-axes"].includes(spec.interpretation)) {
      errors.push(`${label} interpretation 必须是 numeric-vector 或 categorical-axes`);
    }
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
          for (const field of ["label", "shape", "kind", "visual", "visualMeaning"]) {
            if (!String(node[field] ?? "").trim()) errors.push(`${label} mode ${mode.id} node ${node.id} 缺少 ${field}`);
          }
          if (node.visual && !runtimeVisualKinds.has(node.visual)) {
            errors.push(`${label} mode ${mode.id} node ${node.id} 的 visual 类型异常：${node.visual}`);
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

  if (fence.language === "token-compute-tower") {
    tokenComputeTowerCount += 1;
    for (const field of ["result", "boundary"]) {
      if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
    }

    const animationContract = spec.animationContract;
    const requiredAnimationContract = {
      board: "single-stage",
      regions: "transparent-embedded",
      focus: "single-changing-narration",
      anchors: "stable-path",
      playback: "auto-with-manual-controls",
      mobile: "document-flow",
      fullscreen: "fixed-exit",
      density: "content-driven",
      guideReservation: "local-only"
    };
    if (!animationContract || typeof animationContract !== "object" || Array.isArray(animationContract)) {
      errors.push(`${label} 缺少 animationContract 动效合同`);
    } else {
      for (const [field, expected] of Object.entries(requiredAnimationContract)) {
        if (animationContract[field] !== expected) {
          errors.push(`${label} animationContract.${field} 必须是 ${expected}`);
        }
      }
    }

    const profiles = Array.isArray(spec.profiles) ? spec.profiles : [];
    if (!profiles.length) errors.push(`${label} 至少需要 1 个 profile`);
    const profileIds = new Set();
    for (const profile of profiles) {
      if (!profile || typeof profile !== "object" || !String(profile.id ?? "").trim() || profileIds.has(profile.id)) {
        errors.push(`${label} profile id 缺失或重复`);
        continue;
      }
      profileIds.add(profile.id);
      for (const field of ["label", "precisionLabel", "inputLabel", "outputLabel"]) {
        if (!String(profile[field] ?? "").trim()) errors.push(`${label} profile ${profile.id} 缺少 ${field}`);
      }
      if (!Number.isFinite(profile.parameters) || profile.parameters <= 0) errors.push(`${label} profile ${profile.id} parameters 必须为正数`);
      if (!Number.isInteger(profile.blocks) || profile.blocks < 1 || profile.blocks > 256) errors.push(`${label} profile ${profile.id} blocks 必须为 1 到 256 的整数`);
      if (!Number.isInteger(profile.vocabSize) || profile.vocabSize < 2) errors.push(`${label} profile ${profile.id} vocabSize 必须为至少 2 的整数`);
      if (!Number.isFinite(profile.bytesPerParameter) || profile.bytesPerParameter <= 0) errors.push(`${label} profile ${profile.id} bytesPerParameter 必须为正数`);
      if (profile.pointsPerBlock !== undefined && (!Number.isInteger(profile.pointsPerBlock) || profile.pointsPerBlock < 16 || profile.pointsPerBlock > 256)) {
        errors.push(`${label} profile ${profile.id} pointsPerBlock 必须为 16 到 256 的整数`);
      }
    }

    const microscope = spec.microscope;
    if (!microscope || typeof microscope !== "object" || Array.isArray(microscope)) {
      errors.push(`${label} 缺少 microscope 算法显微镜`);
    } else {
      for (const field of ["ariaLabel", "result", "boundary"]) {
        if (!String(microscope[field] ?? "").trim()) errors.push(`${label} microscope 缺少 ${field}`);
      }
      const dimensions = microscope.dimensions ?? {};
      for (const field of ["hidden", "mlp", "vocab"]) {
        if (!Number.isInteger(dimensions[field]) || dimensions[field] < 2 || dimensions[field] > 256) {
          errors.push(`${label} microscope.dimensions.${field} 必须是 2 到 256 的整数`);
        }
      }
      if (dimensions.hidden !== 4 || dimensions.mlp !== 8 || dimensions.vocab !== 8) {
        errors.push(`${label} microscope 必须复用课程 L0 规模 D=4、M=8、V=8`);
      }
      const requiredLabels = [
        "scope", "scopeBoundary", "metricScope", "metricScopeValue", "metricCurrent", "metricVector", "metricVectorUnit",
        "historyLane", "cachePlain", "cacheFormal", "currentLane", "currentPlain", "enterAction", "currentState", "inputSymbol", "vectorScale",
        "projectInput", "projectAction", "appendAction", "scoreAction", "scoreResult", "scoreSymbol", "normalizeAction", "weightResult",
        "contextAction", "contextResult", "contextSymbol", "residualInput", "residualAction", "residualOutput", "residualOutputSymbol", "attentionResidual",
        "mlpInput", "mlpAction", "mlpRule", "mlpWriteAction", "mlpDelta", "mlpDeltaSymbol", "mlpResidualAction", "mlpResidual",
        "blockOutput", "blockOutputSymbol", "finalNormAction", "headInput", "outputSymbol", "headAction", "vocabResult", "selectionAction", "selection"
      ];
      for (const field of requiredLabels) {
        if (!String(microscope.labels?.[field] ?? "").trim()) errors.push(`${label} microscope.labels 缺少 ${field}`);
      }
      const projections = Array.isArray(microscope.projections) ? microscope.projections : [];
      const projectionOrder = ["query", "key", "value"];
      if (projections.length !== projectionOrder.length || projections.some((item, index) => item?.id !== projectionOrder[index])) {
        errors.push(`${label} microscope.projections 必须按 query → key → value 排列`);
      }
      if (projections.some((item) => ![item?.symbol, item?.weight, item?.plain].every((value) => String(value ?? "").trim()))) {
        errors.push(`${label} microscope.projections 每项都需要 symbol、weight 与 plain`);
      }
      const sequence = Array.isArray(microscope.sequence) ? microscope.sequence : [];
      if (sequence.length !== 4) errors.push(`${label} microscope.sequence 必须复用课程 L0 的 T=4`);
      if (sequence.filter((item) => item?.role === "current").length !== 1) errors.push(`${label} microscope.sequence 必须且只能有 1 个 current 位置`);
      if (sequence.at(-1)?.role !== "current" || sequence.slice(0, -1).some((item) => item?.role !== "cache")) {
        errors.push(`${label} microscope.sequence 必须先列历史 cache，最后列本轮 current`);
      }
      if (sequence.some((item) => !String(item?.token ?? "").trim() || !["cache", "current"].includes(item?.role) || !Number.isFinite(item?.score) || !Number.isFinite(item?.attention) || item.attention < 0 || item.attention > 1 || !Array.isArray(item?.value) || item.value.length !== dimensions.hidden || item.value.some((value) => !Number.isFinite(value)))) {
        errors.push(`${label} microscope.sequence 每项都需要 token、cache/current role、有限 score、0 到 1 的 attention 与 ${dimensions.hidden} 维 value`);
      }
      const attentionTotal = sequence.reduce((sum, item) => sum + (Number.isFinite(item?.attention) ? item.attention : 0), 0);
      if (Math.abs(attentionTotal - 1) > 1e-9) errors.push(`${label} microscope.sequence attention 之和必须为 1`);
      if (sequence.length && sequence.every((item) => Number.isFinite(item?.score) && Number.isFinite(item?.attention))) {
        const exponentials = sequence.map((item) => Math.exp(item.score));
        const exponentialTotal = exponentials.reduce((sum, value) => sum + value, 0);
        if (sequence.some((item, index) => Math.abs(exponentials[index] / exponentialTotal - item.attention) > 0.005)) {
          errors.push(`${label} microscope.sequence attention 必须与 score 的 softmax 结果一致`);
        }
      }

      const hidden = dimensions.hidden;
      const vectorNames = ["input", "context", "afterAttention", "mlpDelta", "output", "normalized"];
      const vectors = microscope.vectors ?? {};
      for (const name of vectorNames) {
        if (!Array.isArray(vectors[name]) || vectors[name].length !== hidden || vectors[name].some((value) => !Number.isFinite(value))) {
          errors.push(`${label} microscope.vectors.${name} 必须包含 ${hidden} 个有限数值`);
        }
      }
      if (vectorNames.every((name) => Array.isArray(vectors[name]) && vectors[name].length === hidden)) {
        for (let index = 0; index < hidden; index += 1) {
          if (Math.abs(vectors.input[index] + vectors.context[index] - vectors.afterAttention[index]) > 1e-9) {
            errors.push(`${label} microscope 第 ${index + 1} 维不满足 input + context = afterAttention`);
          }
          if (Math.abs(vectors.afterAttention[index] + vectors.mlpDelta[index] - vectors.output[index]) > 1e-9) {
            errors.push(`${label} microscope 第 ${index + 1} 维不满足 afterAttention + mlpDelta = output`);
          }
        }
        const outputRms = Math.sqrt(vectors.output.reduce((sum, value) => sum + value * value, 0) / hidden);
        if (!Number.isFinite(outputRms) || outputRms <= 0) {
          errors.push(`${label} microscope.vectors.output 必须能计算非零 RMS`);
        } else {
          for (let index = 0; index < hidden; index += 1) {
            if (Math.abs(vectors.output[index] / outputRms - vectors.normalized[index]) > 0.01) {
              errors.push(`${label} microscope 第 ${index + 1} 维 normalized 必须等于 output 的教学 RMSNorm（缩放参数为 1）`);
            }
          }
        }
      }
      if (sequence.length && sequence.every((item) => Array.isArray(item?.value) && item.value.length === hidden) && Array.isArray(vectors.context) && vectors.context.length === hidden) {
        for (let index = 0; index < hidden; index += 1) {
          const weightedValue = sequence.reduce((sum, item) => sum + item.attention * item.value[index], 0);
          if (Math.abs(weightedValue - vectors.context[index]) > 1e-9) {
            errors.push(`${label} microscope 第 ${index + 1} 维不满足 attention 加权 V = context`);
          }
        }
      }

      const vocab = Array.isArray(microscope.vocab) ? microscope.vocab : [];
      if (vocab.length !== dimensions.vocab) errors.push(`${label} microscope.vocab 数量必须等于 dimensions.vocab`);
      if (vocab.some((item) => !String(item?.token ?? "").trim() || !Number.isFinite(item?.logit) || typeof item?.selected !== "boolean")) {
        errors.push(`${label} microscope.vocab 每项都需要 token、有限 logit 与 selected`);
      }
      const selectedVocab = vocab.filter((item) => item?.selected);
      if (selectedVocab.length !== 1) errors.push(`${label} microscope.vocab 必须且只能选中 1 项`);
      else if (selectedVocab[0].logit !== Math.max(...vocab.map((item) => item.logit))) errors.push(`${label} microscope greedy 选中项必须拥有最大 logit`);

      const microStageOrder = ["micro-position", "micro-project", "micro-score", "micro-context", "micro-residual", "micro-mlp", "micro-head", "micro-select"];
      const microSteps = Array.isArray(microscope.steps) ? microscope.steps : [];
      if (microSteps.length !== microStageOrder.length || microSteps.some((step, index) => step?.stage !== microStageOrder[index])) {
        errors.push(`${label} microscope.steps 必须按 ${microStageOrder.join(" → ")} 排列`);
      }
      for (const step of microSteps) {
        if (![step?.title, step?.pathLabel, step?.methodKind, step?.method, step?.focus, step?.watch, step?.purpose, step?.detail, step?.reflection].every((value) => String(value ?? "").trim())) {
          errors.push(`${label} microscope 每个 step 都需要 stage、title、pathLabel、methodKind、method、focus、watch、purpose、detail 与 reflection`);
        }
      }
    }

    const stageOrder = ["input", "layers", "head", "select"];
    const validStages = new Set(stageOrder);
    const usedStages = new Set();
    const steps = Array.isArray(spec.steps) ? spec.steps : [];
    if (steps.length < validStages.size) errors.push(`${label} 至少需要 ${validStages.size} 个 steps`);
    for (const step of steps) {
      if (![step?.title, step?.watch, step?.purpose, step?.detail, step?.reflection].every((value) => String(value ?? "").trim())) {
        errors.push(`${label} 每个 step 都需要 stage、title、watch、purpose、detail 与 reflection`);
        continue;
      }
      if (!validStages.has(step.stage)) {
        errors.push(`${label} step.stage 必须是 input、layers、head 或 select`);
      } else if (usedStages.has(step.stage)) {
        errors.push(`${label} stage ${step.stage} 重复`);
      } else {
        usedStages.add(step.stage);
      }
    }
    const missingStages = [...validStages].filter((stage) => !usedStages.has(stage));
    if (missingStages.length) errors.push(`${label} 缺少 stage：${missingStages.join("、")}`);
    if (steps.length === stageOrder.length && steps.some((step, index) => step?.stage !== stageOrder[index])) {
      errors.push(`${label} steps 必须按 ${stageOrder.join(" → ")} 排列`);
    }
  }
}

function validateFormulaStoryFence(fence, relativePath) {
  let spec;
  try {
    spec = JSON.parse(fence.content);
  } catch (error) {
    errors.push(`${relativePath}:${fence.start} formula-story JSON 解析失败：${error.message}`);
    return;
  }

  const label = `${relativePath}:${fence.start} formula-story`;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    errors.push(`${label} 必须是 JSON 对象`);
    return;
  }
  for (const field of ["ariaLabel", "title", "goal", "pattern"]) {
    if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
  }
  if (!["flow", "branch", "merge"].includes(spec.pattern)) errors.push(`${label} pattern 必须是 flow、branch 或 merge`);
  if (!Number.isInteger(spec.coversNext) || spec.coversNext < 0 || spec.coversNext > 8) {
    errors.push(`${label} coversNext 必须是 0 到 8；0 表示概念关系图，正数声明本图覆盖后续几个块级公式`);
  }
  const items = Array.isArray(spec.items) ? spec.items : [];
  if (items.length < 2 || items.length > 6) errors.push(`${label} items 必须包含 2 到 6 个参与对象`);
  for (const [index, item] of items.entries()) {
    if (![item?.label, item?.name, item?.detail].every((value) => String(value ?? "").trim())) {
      errors.push(`${label} item ${index + 1} 必须包含 label、name 与 detail`);
    }
  }
  if (["flow", "branch"].includes(spec.pattern) && !spec.source) errors.push(`${label} ${spec.pattern} 必须声明 source`);
  if (["flow", "merge"].includes(spec.pattern) && !spec.result) errors.push(`${label} ${spec.pattern} 必须声明 result`);
  for (const [name, node] of [["source", spec.source], ["result", spec.result]]) {
    if (node && ![node.label, node.name, node.detail].every((value) => String(value ?? "").trim())) {
      errors.push(`${label} ${name} 必须包含 label、name 与 detail`);
    }
  }
  for (const field of ["example", "counterfactual"]) {
    const value = spec[field];
    if (!value || ![value.label, value.text].every((part) => String(part ?? "").trim())) {
      errors.push(`${label} ${field} 必须包含 label 与 text`);
    }
  }
  if (!String(spec.boundary ?? "").trim()) errors.push(`${label} 缺少 boundary`);
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

function validateGenerationRoadmapFence(fence, relativePath) {
  generationRoadmapCount += 1;
  let spec;
  try {
    spec = JSON.parse(fence.content);
  } catch (error) {
    errors.push(`${relativePath}:${fence.start} generation-roadmap JSON 解析失败：${error.message}`);
    return;
  }

  const label = `${relativePath}:${fence.start} generation-roadmap`;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    errors.push(`${label} 必须是 JSON 对象`);
    return;
  }
  for (const field of ["ariaLabel", "learningGoal", "watchFor", "boundary"]) {
    if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
  }
  for (const field of ["main", "detail", "loop"]) {
    if (!String(spec.legend?.[field] ?? "").trim()) errors.push(`${label} 图例缺少 ${field}`);
  }
  if (!String(spec.loop?.source ?? "").trim()) errors.push(`${label} 条件回环缺少 source`);
  for (const field of ["label", "action", "result", "control"]) {
    if (!String(spec.loop?.display?.[field] ?? "").trim()) errors.push(`${label} 显示用途缺少 ${field}`);
  }
  for (const field of ["label", "action", "stop", "continue"]) {
    if (!String(spec.loop?.decision?.[field] ?? "").trim()) errors.push(`${label} 停止判断缺少 ${field}`);
  }
  for (const field of ["label", "action", "shape", "detail", "return"]) {
    if (!String(spec.loop?.decode?.[field] ?? "").trim()) errors.push(`${label} decode 条件操作缺少 ${field}`);
  }

  const stages = Array.isArray(spec.stages) ? spec.stages : [];
  if (stages.length < 4 || stages.length > 8) errors.push(`${label} stages 应包含 4 到 8 个可扫读阶段`);
  const stageNumbers = new Set();
  for (const stage of stages) {
    if (!stage || typeof stage !== "object") {
      errors.push(`${label} stage 必须是对象`);
      continue;
    }
    for (const field of ["number", "title", "summary", "shape"]) {
      if (!String(stage[field] ?? "").trim()) errors.push(`${label} stage 缺少 ${field}`);
    }
    if (stageNumbers.has(stage.number)) errors.push(`${label} stage number 重复：${stage.number}`);
    stageNumbers.add(stage.number);
    if (!["left", "right"].includes(stage.side)) errors.push(`${label} stage ${stage.number ?? "<未编号>"} side 必须是 left 或 right`);
    const details = Array.isArray(stage.details) ? stage.details : [];
    if (!details.length || details.length > 3) errors.push(`${label} stage ${stage.number ?? "<未编号>"} 需要 1 到 3 个旁支`);
    for (const detail of details) {
      if (!String(detail?.label ?? "").trim() || !String(detail?.value ?? "").trim()) {
        errors.push(`${label} stage ${stage.number ?? "<未编号>"} 的旁支需要 label 和 value`);
      }
    }
  }
}

function validateBenchmarkChartFence(fence, relativePath) {
  benchmarkChartCount += 1;
  let spec;
  try {
    spec = JSON.parse(fence.content);
  } catch (error) {
    errors.push(`${relativePath}:${fence.start} benchmark-chart JSON 解析失败：${error.message}`);
    return;
  }

  const label = `${relativePath}:${fence.start} benchmark-chart`;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    errors.push(`${label} 必须是 JSON 对象`);
    return;
  }
  for (const field of ["ariaLabel", "eyebrow", "title", "subtitle", "footnote"]) {
    if (!String(spec[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
  }
  if (!String(spec.updated ?? "").trim() || !String(spec.evidence ?? "").trim()) {
    errors.push(`${label} 必须提供 updated 和可复核的 evidence`);
  }
  if (spec.credibility !== undefined) errors.push(`${label} 不得使用不可复算的 credibility 等级，请改写为 evidence`);
  if (!Number.isFinite(spec.max) || spec.max <= 0) errors.push(`${label} max 必须是正数`);

  const ticks = Array.isArray(spec.ticks) ? spec.ticks : [];
  if (
    ticks.length < 2 ||
    ticks.some((tick) => !Number.isFinite(tick) || tick < 0 || tick > spec.max) ||
    ticks.some((tick, index) => index > 0 && tick <= ticks[index - 1]) ||
    ticks[0] !== 0 ||
    ticks.at(-1) !== spec.max
  ) {
    errors.push(`${label} ticks 必须从 0 到 max 严格递增`);
  }

  const bars = Array.isArray(spec.bars) ? spec.bars : [];
  if (bars.length < 2 || bars.length > 12) errors.push(`${label} bars 必须包含 2 到 12 项`);
  const barLabels = new Set();
  const allowedTones = new Set(["brand", "blue", "orange", "danger", "muted"]);
  for (const bar of bars) {
    if (!bar || typeof bar !== "object") {
      errors.push(`${label} bar 必须是对象`);
      continue;
    }
    if (!String(bar.label ?? "").trim() || barLabels.has(bar.label)) {
      errors.push(`${label} bar label 缺失或重复`);
    }
    barLabels.add(bar.label);
    if (!Number.isFinite(bar.value) || bar.value < 0 || bar.value > spec.max) {
      errors.push(`${label} bar ${bar.label ?? "<未命名>"} 的 value 必须在 0 到 max 之间`);
    }
    if (!String(bar.display ?? "").trim() || !String(bar.note ?? "").trim()) {
      errors.push(`${label} bar ${bar.label ?? "<未命名>"} 需要 display 和 note`);
    }
    if (bar.tone !== undefined && !allowedTones.has(bar.tone)) {
      errors.push(`${label} bar ${bar.label ?? "<未命名>"} 使用了未知 tone`);
    }
  }
  if (!spec.rankBy) {
    const values = bars.map((bar) => bar?.value);
    const ordered = values.every((value, index) => index === 0 || (
      spec.lowerIsBetter ? value >= values[index - 1] : value <= values[index - 1]
    ));
    if (!ordered) errors.push(`${label} bars 必须按 value ${spec.lowerIsBetter ? "升序" : "降序"}排列；若位置按另一指标产生，必须填写 rankBy`);
  }
}

function validateBenchmarkLeaderboardFence(fence, relativePath) {
  benchmarkLeaderboardCount += 1;
  let spec;
  try {
    spec = JSON.parse(fence.content);
  } catch (error) {
    errors.push(`${relativePath}:${fence.start} benchmark-leaderboard JSON 解析失败：${error.message}`);
    return;
  }

  const label = `${relativePath}:${fence.start} benchmark-leaderboard`;
  for (const field of ["ariaLabel", "eyebrow", "title", "subtitle", "footnote"]) {
    if (!String(spec?.[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
  }
  if (!String(spec?.updated ?? "").trim() || !String(spec?.evidence ?? "").trim()) {
    errors.push(`${label} 必须提供 updated 和可复核的 evidence`);
  }
  if (spec?.credibility !== undefined) errors.push(`${label} 不得使用不可复算的 credibility 等级，请改写为 evidence`);
  const columns = Array.isArray(spec?.columns) ? spec.columns : [];
  const rows = Array.isArray(spec?.rows) ? spec.rows : [];
  if (columns.length < 2 || columns.length > 12) errors.push(`${label} columns 必须包含 2 到 12 项`);
  if (rows.length < 2 || rows.length > 100) errors.push(`${label} rows 必须包含 2 到 100 项`);
  const columnKeys = new Set();
  for (const column of columns) {
    if (!String(column?.key ?? "").trim() || !String(column?.label ?? "").trim() || columnKeys.has(column.key)) {
      errors.push(`${label} column key/label 缺失或重复`);
    }
    columnKeys.add(column.key);
  }
  const rowNames = new Set();
  for (const row of rows) {
    if (!String(row?.name ?? "").trim() || rowNames.has(row.name)) errors.push(`${label} row name 缺失或重复`);
    rowNames.add(row.name);
    if (!row?.values || typeof row.values !== "object" || Array.isArray(row.values)) {
      errors.push(`${label} ${row.name ?? "<未命名>"} 缺少 values 对象`);
      continue;
    }
    for (const key of columnKeys) {
      const value = row.values[key];
      if (value !== null && value !== undefined && value !== "" && typeof value !== "number" && typeof value !== "string") {
        errors.push(`${label} ${row.name ?? "<未命名>"}.${key} 必须是数字或文本`);
      }
    }
  }
}

for (const file of markdownFiles) {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");

  if (source.includes("07-来源与质量审计") || source.includes("internal/来源与质量审计")) {
    errors.push(`${relativePath}: 用户课程不得链接内部质量审计目录`);
  }

  if (/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|\b)/iu.test(source)) {
    errors.push(`${relativePath}: 用户课程不得写入 localhost 或 127.0.0.1 开发地址`);
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

  for (const fence of fences.filter((item) => ["pencil-flow", "pencil-vector", "pencil-formula-plane", "pencil-3d", "model-runtime", "token-compute-tower"].includes(item.language))) {
    validatePencilFence(fence, relativePath);
  }

  for (const fence of fences.filter((item) => item.language === "lesson-board")) {
    validateLessonBoardFence(fence, relativePath);
  }

  for (const fence of fences.filter((item) => item.language === "formula-story")) {
    formulaStoryCount += 1;
    validateFormulaStoryFence(fence, relativePath);
  }

  const sourceLines = source.split(/\r?\n/);
  const formulaStoryCoverage = [];
  for (const fence of fences.filter((item) => item.language === "formula-story")) {
    try {
      const spec = JSON.parse(fence.content);
      const closingLine = fence.start + fence.content.split(/\r?\n/).length + 1;
      formulaStoryCoverage.push({ closingLine, remaining: spec.coversNext });
    } catch {
      // JSON errors are reported by validateFormulaStoryFence.
    }
  }
  let openFormula = false;
  let formulaCount = 0;
  for (let index = 0; index < sourceLines.length; index += 1) {
    if (fences.some((fence) => index + 1 >= fence.start && index + 1 <= fence.start + fence.content.split(/\r?\n/).length + 1)) continue;
    if (!/^\$\$\s*$/.test(sourceLines[index])) continue;
    if (!openFormula) {
      openFormula = true;
      formulaCount += 1;
      const candidate = formulaStoryCoverage
        .filter((item) => item.closingLine < index + 1 && item.remaining > 0)
        .sort((a, b) => b.closingLine - a.closingLine)[0];
      if (!candidate) errors.push(`${relativePath}:${index + 1} 块级公式前缺少 formula-story 可视推演`);
      else candidate.remaining -= 1;
    } else {
      openFormula = false;
    }
  }
  for (const coverage of formulaStoryCoverage) {
    if (coverage.remaining !== 0) errors.push(`${relativePath}:${coverage.closingLine} formula-story 的 coversNext 超过后续块级公式数量`);
  }

  for (const fence of fences.filter((item) => item.language === "generation-roadmap")) {
    validateGenerationRoadmapFence(fence, relativePath);
  }

  for (const fence of fences.filter((item) => item.language === "benchmark-chart")) {
    validateBenchmarkChartFence(fence, relativePath);
  }

  for (const fence of fences.filter((item) => item.language === "benchmark-leaderboard")) {
    validateBenchmarkLeaderboardFence(fence, relativePath);
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

  await validateLocalMarkdownLinks(file, source, relativePath);
}

for (const file of repositoryDocumentationFiles) {
  const relativePath = path.relative(repoRoot, file).replaceAll("\\", "/");
  await validateLocalMarkdownLinks(file, await readFile(file, "utf8"), relativePath);
}

for (const lesson of courseLessons) {
  const lessonPath = path.join(root, lesson.source);
  if (!(await exists(lessonPath))) {
    errors.push(`课程清单缺少文件：${lesson.source}`);
    continue;
  }

  const source = await readFile(lessonPath, "utf8");
  const lessonCode = `D${String(lesson.day).padStart(2, "0")}`;
  const expectedHeading = `# ${lessonCode}：${lesson.title}`;
  if (!source.startsWith(expectedHeading)) {
    errors.push(`${lesson.source}: 页面标题必须与课程清单一致，期望 ${expectedHeading}`);
  }
  if (!source.includes("> **学习导航**：")) {
    errors.push(`${lesson.source}: 缺少承接、本课任务与完成证据组成的学习导航`);
  }
  const learningNavigation = source.match(/^> \*\*学习导航\*\*：(.+)$/mu)?.[1] ?? "";
  if (!/(完成后|学完后|完成证据)/u.test(learningNavigation)) {
    errors.push(`${lesson.source}: 学习导航必须直接给出可观察的完成证据`);
  }
  const hasLearningRationale = lesson.phase === "理论"
    ? /^## 先记(?:三|四)/mu.test(source)
    : source.includes("## 本课核心判断") || source.includes("## 为什么要学这一课");
  if (!hasLearningRationale) {
    errors.push(`${lesson.source}: 缺少可扫读的核心判断或学习必要性说明`);
  }

  if (lesson.phase === "案例") {
    const sectionCount = source.match(/^## /gmu)?.length ?? 0;
    const exerciseCount = source.match(/<ExerciseBlock\b/gu)?.length ?? 0;
    if (sectionCount < 6) {
      errors.push(`${lesson.source}: 训练过程案例至少需要 6 个二级章节，不能退化为短表格和口头问题`);
    }
    if (!source.includes("## 本课验收") || exerciseCount < 3) {
      errors.push(`${lesson.source}: 训练过程案例必须包含本课验收和至少 3 道可展开练习`);
    }
    if (source.includes("## 本课目标")) {
      errors.push(`${lesson.source}: 案例页目标已并入学习导航，不得恢复重复的本课目标栏目`);
    }
  }
}

const repeatedLessonTitles = courseLessons
  .map((lesson) => lesson.title)
  .filter((title, index, titles) => titles.indexOf(title) !== index);
if (repeatedLessonTitles.length > 0) {
  errors.push(`课程清单存在重复展示标题：${[...new Set(repeatedLessonTitles)].join("、")}`);
}

for (const relativePath of [
  "01-14天理论课/D01-大模型到底是什么.md",
  "01-14天理论课/D02-文字如何变成数字.md",
  "01-14天理论课/D05-注意力机制.md",
  "01-14天理论课/D06-拼出完整Transformer.md",
  "01-14天理论课/D07-模型一次运行到底发生什么.md"
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
  for (const marker of [...l0ConfigurationMarkers, "闭卷"]) {
    if (!source.includes(marker)) errors.push(`${relativePath}: 缺少统一教学模型或重建要求 ${marker}`);
  }
}

const theoryReadmeSource = await readFile(path.join(root, "01-14天理论课/README.md"), "utf8");
for (const marker of l0ConfigurationMarkers) {
  if (!theoryReadmeSource.includes(marker)) errors.push(`01-14天理论课/README.md: 缺少统一教学模型配置 ${marker}`);
}

for (const lesson of courseLessons.filter((item) => item.phase === "理论")) {
  const source = await readFile(path.join(root, lesson.source), "utf8");
  const overview = lesson.day <= 4 ? "模型原理总纲.md" : lesson.day <= 7 ? "模型架构总纲.md" : "模型训练总纲.md";
  const learningNavigation = source.match(/^> \*\*学习导航\*\*：(.+)$/mu)?.[1] ?? "";
  if (!learningNavigation.includes(`](${overview})`)) errors.push(`${lesson.source}: 学习导航必须链接到 ${overview}`);
  if (source.includes("> **主线位置**：") || source.includes("## 本课目标")) {
    errors.push(`${lesson.source}: 页首任务已并入学习导航，不得恢复重复的主线位置或本课目标脚手架`);
  }
}

const animationLabPath = "04-图解与数字漫画/动画模型实验室.md";
const animationLabSource = await readFile(path.join(root, animationLabPath), "utf8");
for (const marker of [
  "# 动画模型实验室：让一条数据走完一次生成",
  "## 一张图走完一次生成",
  "```generation-roadmap",
  '"main": "必经生成主线"',
  '"detail": "同源分叉的阶段注释"',
  "每个绿色分叉点向外展开本阶段注释，不是额外计算步骤",
  '"loop": "满足条件才回到下一轮"',
  '"number": "01"',
  '"number": "06"',
  "聊天应用通常先用 chat template 把消息序列化，再交给 tokenizer",
  "本步只查表，得到初始浮点表示",
  "位置线索不统一归入查表",
  "位置 Embedding 可在进入 Block 前与 token 表示结合",
  "RoPE 在每层注意力内作用于 Q/K",
  "相对位置偏置作用于注意力分数",
  "各位置临时隐藏状态",
  "保存各注意力层后续需要的历史 K/V",
  "本页因果路径中位置可批量计算；因果遮罩仍限制每个位置只能看自己及此前位置",
  "原始 logits",
  "正 temperature 通常以 logits / temperature 缩放",
  "top-k 通常保留分数最高的 k 项",
  "top-p 将 softmax 概率降序排列，取累计概率达到 p 的最小前缀",
  "最终对保留项重归一化并采样",
  "生成算法只需要最后有效位置的词表分数",
  "prefill 主干仍对全部有效提示位置计算隐藏状态 (1,T_prompt,D)",
  "实现路径 A",
  "实现路径 B",
  "不与路径 A 重复执行",
  "若 B>1 且使用 padding，各序列最后有效位置不一定是张量末列",
  "V 个候选 → 1 个已接受 ID",
  "历史 K/V",
  "decode 前向",
  "滑动窗口或缓存淘汰等实现可能限制历史 K/V 的保留长度",
  "临时隐藏状态",
  "服务通常先从检查点加载权重；请求只读已加载权重，不执行反向传播或参数更新",
  "logits 是未归一化分数，不是概率",
  "同一个已接受 ID：进入生成后处理",
  "已接受 ID 记录、下一轮模型输入、可见文本缓冲不是同一个序列",
  "进入增量反分词 / 文本缓冲",
  "token 或文本缓冲得到的停止字符串匹配结果",
  "检查该序列是否继续",
  "EOS 或长度上限；token 或文本缓冲匹配停止字符串；应用规则中止或转交",
  "以上均未命中 → 把该 ID 作为下一模型位置，再进入单步 decode 前向",
  "Decode 单步前向",
  "(1,1,D) + 历史 K/V → (1,V) 原始 logits",
  "不重新 prefill 整段提示",
  "下一轮原始 logits → 回到第 05 步“logits → 已接受 ID”",
  "候选 logits 不全相等且只应用正 temperature",
  "已接受 ID 可以先进入记录，但只有未停止序列才把它作为下一模型位置",
  "本图固定批大小 B=1，描述带 KV Cache 的 Decoder-only Transformer 基础自回归路径",
  "T_prompt 是 prefill 提示的有效 token 数，S_cache 是某一时刻缓存的位置数，N_layer 是 Transformer 层数"
]) {
  if (!animationLabSource.includes(marker)) errors.push(`${animationLabPath}: 自回归总览缺少正确阶段或对象 ${marker}`);
}
if ((animationLabSource.match(/```generation-roadmap/g) ?? []).length !== 1 || animationLabSource.includes("```mermaid")) {
  errors.push(`${animationLabPath}: 必须只保留一张连续生成路线图，不得恢复割裂的 Mermaid 流程图`);
}
for (const forbidden of [
  "只预测下一个词",
  "查 Embedding 表并加入位置表示",
  "按贪心、temperature、top-k 或 top-p 选一个候选",
  "隐藏状态与 KV Cache",
  "已接受 ID → 显示或继续",
  "概念全量",
  "Decoder-only 文本模型基础路径"
]) {
  if (animationLabSource.includes(forbidden)) errors.push(`${animationLabPath}: 不得恢复误导表述 ${forbidden}`);
}
for (const forbidden of [
  "最后有效位置 → logits",
  "2(K/V) × L × B × Hkv × T × Dh",
  "greedy / temperature / top-p",
  "追加到上下文",
  "未停止 → 用已接受 ID 进入下一轮 decode 前向"
]) {
  if (animationLabSource.includes(forbidden)) errors.push(`${animationLabPath}: 不得恢复符号或流程歧义 ${forbidden}`);
}

const trainingLoopSource = await readFile(path.join(root, "01-14天理论课/D09-训练任务内部的一次完整循环.md"), "utf8");
if (!trainingLoopSource.startsWith("# D09：一个训练 Step 如何推动整次任务") || !trainingLoopSource.includes("## 先分清三个尺度")) {
  errors.push("D09 必须明确区分完整模型项目、一次训练任务和一个训练 step");
}
for (const marker of [
  "evaluate_without_updating_parameters()\nsave_checkpoint(step=0)",
  "for completed_steps in range(1, max_steps + 1):",
  "step 表示“已经完成多少次参数更新”"
]) {
  if (!trainingLoopSource.includes(marker)) errors.push(`D09 必须把 step=0 定义为更新前起点：${marker}`);
}
for (const marker of ["五种训练计数不能混用", "有效计分 token", "optimizer step", "epoch"]) {
  if (!trainingLoopSource.includes(marker)) errors.push(`D09 必须区分训练计数口径：${marker}`);
}

const trainingDepthSections = [
  ["01-14天理论课/D08-训练数据与分词器.md", [
    "## 打包不只是把短文本拼起来",
    "## 数据配比最终要落到 token 预算",
    "## Tokenizer 报告要看尾部失败"
  ]],
  ["01-14天理论课/D09-训练任务内部的一次完整循环.md", [
    "## Loss 的分母会改变每个 token 的权重",
    "## AdamW 怎样把当前梯度变成一次更新",
    "## 停下、保存和恢复是三件事"
  ]],
  ["01-14天理论课/D10-预训练与规模化训练.md", [
    "## 激活内存为什么会随形状快速变化",
    "## 从 FLOPs 推到时间还差一个利用率",
    "## 一次并行诊断要把时间拆开"
  ]],
  ["01-14天理论课/D11-SFT、LoRA与QLoRA.md", [
    "## 从一个矩阵扩展到整套目标模块",
    "## 冻结基座不等于绕过基座",
    "### 用 10 亿参数做一次 QLoRA 显存账本",
    "### 合并前后怎样证明交付一致"
  ]],
  ["01-14天理论课/D12-对齐、强化学习与评测.md", [
    "## DPO：偏好对怎样产生一个更新方向",
    "## GRPO：原始奖励怎样变成组内相对优势",
    "## 奖励分项必须保留硬门槛",
    "### 裁判校准要落到一张对照表"
  ]],
  ["01-14天理论课/D13-推理、部署、RAG与Agent.md", [
    "## KV Cache 为什么会吃掉并发显存",
    "## 连续批处理怎样改变等待与吞吐",
    "### 一次 RAG 请求的候选与上下文账本",
    "### 把循环写成可恢复的状态机"
  ]],
  ["01-14天理论课/D14-监控、反馈与持续迭代.md", [
    "## 同一个百分比可能有完全不同的证据强度",
    "### 灰度对照要比较率、样本量和切片",
    "## SLO 与错误预算怎样约束发布速度",
    "### 风险抽样可以找问题，不能直接估计总体比例"
  ]]
];
for (const [relativePath, headings] of trainingDepthSections) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const heading of headings) {
    if (!source.includes(heading)) errors.push(`${relativePath}: 训练主线深度章节不得缺失 ${heading}`);
  }
}

const condensedTheorySections = [
  ["01-14天理论课/D08-训练数据与分词器.md", ["## 数据不是越多越好", "## 因果语言模型的标签", "## 数据配比先写成假设"]],
  ["01-14天理论课/D09-训练任务内部的一次完整循环.md", ["## 梯度累积"]],
  ["01-14天理论课/D10-预训练与规模化训练.md", ["## 先做资源账本，再谈能不能训练"]],
  ["01-14天理论课/D11-SFT、LoRA与QLoRA.md", ["## 什么时候先别微调（选型前必看）"]],
  ["01-14天理论课/D12-对齐、强化学习与评测.md", ["## 对齐在解决什么", "### DPO 与 GRPO", "### 在策略蒸馏：密集教师信号也有可学习性条件", "## 安全不是一项总分"]],
  ["01-14天理论课/D13-推理、部署、RAG与Agent.md", ["## 方法选择顺序"]],
  ["01-14天理论课/D14-监控、反馈与持续迭代.md", ["## 决定改哪一层", "## 反馈怎样回到下一轮"]]
];
for (const [relativePath, headings] of condensedTheorySections) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const heading of headings) {
    if (source.includes(heading)) errors.push(`${relativePath}: 已合并的低密度重复章节不得恢复 ${heading}`);
  }
}

const deployedSystemLessonSource = await readFile(path.join(root, "01-14天理论课/D13-推理、部署、RAG与Agent.md"), "utf8");
for (const marker of [
  "检索指标的分母必须对应真实问题",
  "必要证据齐全率",
  "真正有机会触发该风险的任务或动作",
  "固定红队题用于覆盖攻击面和发现失败"
]) {
  if (!deployedSystemLessonSource.includes(marker)) errors.push(`D13 必须保留 RAG 与 Agent 指标的正确分母：${marker}`);
}

const monitoringLessonSource = await readFile(path.join(root, "01-14天理论课/D14-监控、反馈与持续迭代.md"), "utf8");
for (const marker of [
  "SE(\\hat p)=\\sqrt{\\frac{p(1-p)}{n}}",
  "\\widehat{SE}(\\hat p)=\\sqrt{\\frac{\\hat p(1-\\hat p)}{n}}",
  "左式是给定真实 $p$ 后的理论标准误，不是近似式",
  "理论标准误公式精确成立",
  "预期成功数 np 与失败数 n(1-p) 是否都足够大",
  "标准误回答重复抽样会波动多大，不能自动修复样本选错了谁",
  "数据漂移通常关注 $P(X)$ 变化，概念漂移关注 $P(Y\\mid X)$ 变化",
  "不是互斥且穷尽的分类",
  "综合分只能辅助摘要或排序，不能替代切片与安全硬门槛",
  "灰度是常用选项，不是所有变更唯一合法的路径",
  "SFT 和偏好优化也都不保证可靠写入事实或补足模型容量",
  "必须执行的拒答、权限和业务红线不能交给偏好优化兜底",
  "不能把概率分类器称为绝对可靠的确定性控制",
  "模型训练即使经评测降低了违规概率",
  "固定分析时点且所用近似有效",
  "区间包含 0 本身既不证明、也不排除非劣",
  "常见的单侧 5% 近似检验看单侧 95% 上界",
  "只确认告警条件触发；先核对分母、数据延迟与窗口波动",
  "随机分流单位要在实验前按串扰与体验边界决定",
  "原始随机分配",
  "它估计“分配到新版本策略”相对旧策略的效果",
  "不能直接解释为实际使用新版本的效果",
  "保留全部随机化单元也不等于给缺失结果编造答案",
  "若指标预先规定超时算失败，超时就是已观察到的失败",
  "至少一个只是偶然越线",
  "采用与判定规则匹配的多重性处理",
  "同时未参与训练、未参与选择且无已知泄露的新确认性证据",
  "不能证明未见问题也没有退化",
  "高损害、安全或快速扩大的事件应立即按预案隔离或降级",
  "后续样本决定结论能说多强，不是启动止损与调查的许可证",
  "测试题还要检查是否进入过训练语料、是否与开发集近重复",
  "下面是可按风险组合的发布工具，不是每次都必须完整串行执行的清单",
  "测试集承担独立确认职责期间，不能用于训练",
  "正式退役旧测试集",
  "旧题此后不能再被称为未见测试数据",
  "不展示结果”不等于没有隐私影响",
  "不能把一次人工判断自动当成真值",
  "协调攻击用重复反馈冒充大量独立证据",
  "只有调查权限问题才需要权限域",
  "每个待推断单位都必须有已知且大于 0 的入选概率",
  "若某类单位的入选概率为 0，它永远不会出现在样本中，不能靠加权恢复",
  "按核验目的连接**必要且获准处理**的上下文",
  "不构成默认保存完整对话和全部轨迹的理由",
  "应按核验目的关联获准处理的必要字段",
  "专门构造的红队题可以发现攻击面，却不代表线上总体的概率样本",
  "一致版本包不等于所有组件回到同一个历史时刻",
  "不等于所有状态都能回滚",
  "数据库 Schema、迁移版本、缓存格式、消息队列协议",
  "支付、通知、工单和第三方写入的幂等键与操作记录",
  "切回旧代码不会自动撤销",
  "30 天内所有 `30×24×60=43,200` 个一分钟格都进入分母",
  "从外部探针观察指定生产区域",
  "每个区域每分钟恰好发起一次探测",
  "所有指定区域的探测都有有效结果且全部成功",
  "探测未发出或记录缺失而无法还原结果",
  "实际最多只能出现 43 个坏格",
  "短于探测间隔的故障可能漏掉",
  "某地区 50% 请求失败 10 分钟",
  "43.2 分钟不是 99.9% SLO 的通用换算",
  "监控缺失不是普通的排除理由，而是“无法判断”",
  "即使再加权也不能消除层内选择偏差",
  "估计总体发生率",
  "比较两种随机分配策略的因果效果",
  "观察期内进入随机化的合格单元",
  "发现攻击面或固定回归",
  "都可以指导下一轮开发",
  "描述当时那个版本在这些指定样本上的表现",
  "不能再作为修改后版本的独立泛化证明",
  "这类设计型推断不要求先假设一个结果预测模型",
  "普查不会自动消除漏记或错判",
  "非概率样本无法只靠普通加权恢复总体",
  "不是统计置信下界"
]) {
  if (!monitoringLessonSource.includes(marker)) errors.push(`D14 必须保留线上统计与归因边界：${marker}`);
}
if (monitoringLessonSource.includes("30 天 99.9% 可用性允许约 43.2 分钟不可用")) {
  errors.push("D14 不得把按时间计量的错误预算换算写成所有可用性 SLO 的通用结论");
}
if (monitoringLessonSource.includes("否则记为可用")) {
  errors.push("D14 多区域 SLO 不得把探测缺失落入可用分支");
}
if (monitoringLessonSource.includes("确认现象扩大，根因未知")) {
  errors.push("D14 不得把单个窗口触发告警直接写成故障已经扩大");
}
if (monitoringLessonSource.includes("三类证据都应与开发过程隔离")) {
  errors.push("D14 不得把开发回归、红队覆盖与修改后版本的确认性证据混为同一隔离要求");
}
if (monitoringLessonSource.includes("其他抽样则需要明确且可审查的模型假设")) {
  errors.push("D14 不得把已知入选概率的概率抽样错误地写成依赖结果模型假设");
}
if (monitoringLessonSource.includes("独立同分布与大样本近似是前提")) {
  errors.push("D14 不得把大样本近似错误地写成伯努利样本比例理论标准误公式的前提");
}
if (monitoringLessonSource.includes("若 1 万条都来自同一种低风险问题，或同一用户的重复请求彼此相关，公式的独立同分布假设就不成立")) {
  errors.push("D14 不得把目标总体错位或选择偏差误写成样本在子总体内必然不独立同分布");
}
if (monitoringLessonSource.includes("应冻结请求与完整轨迹") || monitoringLessonSource.includes("先保存请求、版本、检索结果、工具轨迹和最终输出")) {
  errors.push("D14 反馈核验不得默认保存完整对话或全部轨迹，应按调查目的最小化证据字段");
}
if (monitoringLessonSource.includes("应连接原请求、版本、检索与工具轨迹及最终任务结果")) {
  errors.push("D14 反馈练习不得把原请求、检索结果和工具轨迹全部写成默认必备证据");
}
if (monitoringLessonSource.includes("不能压成一个总分")) {
  errors.push("D14 不得把综合分本身写成错误做法；应限定其不能替代分层结果、切片与安全硬门槛");
}
if (monitoringLessonSource.includes("发布必须有回归、灰度、停止条件和可恢复版本包")) {
  errors.push("D14 不得把灰度发布写成所有发布的必经步骤，应按变更风险选择发布策略");
}
if (monitoringLessonSource.includes("冻结测试集既不能混回训练")) {
  errors.push("D14 不得把测试隔离写成永久禁令；应限定为测试集承担独立确认职责期间");
}
if (monitoringLessonSource.includes("不能证明两个版本等价或新版本不劣")) {
  errors.push("D14 不得把区间包含零误写成不能证明非劣；非劣应比较方向正确的单侧界限与预设界值");
}
if (monitoringLessonSource.includes("确认现象后，才进入根因定位") || monitoringLessonSource.includes("确认现象后才进入根因定位")) {
  errors.push("D14 不得把连续窗口确认写成高损害事件开始止损或根因调查的前置许可");
}

const checkpointLessonSource = await readFile(path.join(root, "02-第3周实战/D19-正式训练与保存检查点.md"), "utf8");
if (checkpointLessonSource.includes("选用于验证集的检查点")) {
  errors.push("D19 不得把验证集写成检查点的用途；应说明根据验证集选择候选检查点");
}

const glossarySource = await readFile(path.join(root, "05-速查表/术语速查.md"), "utf8");
const wikiTermsSource = await readFile(path.join(repoRoot, ".vitepress/wiki-terms.mjs"), "utf8");
for (const [relativePath, source] of [
  ["05-速查表/术语速查.md", glossarySource],
  [".vitepress/wiki-terms.mjs", wikiTermsSource]
]) {
  if (source.includes("在同一前缀上同时训练多个未来位置")) {
    errors.push(`${relativePath}: MTP 通用定义不得绑定为同一前缀上的单一实现`);
  }
  if (!source.includes("并行预测头") || !source.includes("串联预测模块")) {
    errors.push(`${relativePath}: MTP 定义必须区分并行预测头与串联预测模块`);
  }
  for (const marker of ["先应用已启用的约束与分数处理", "greedy 对处理后的候选取最大项", "sampling 可组合 temperature 缩放", "重归一化"]) {
    if (!source.includes(marker)) errors.push(`${relativePath}: 解码策略定义必须保留组合关系 ${marker}`);
  }
  if (source.includes("例如 greedy、temperature、top-k 或 top-p") || source.includes("如 greedy、temperature、top-k 或 top-p")) {
    errors.push(`${relativePath}: 不得把 greedy、temperature、top-k 与 top-p 写成互斥同级策略`);
  }
}

for (const relativePath of [
  "06-拓展知识库/实际模型项目/01-问题合同与冻结验收集.md",
  "06-拓展知识库/实际模型项目/02-基线阶梯与方法选择.md"
]) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const marker of ["开发评测集", "冻结测试集"]) {
    if (!source.includes(marker)) errors.push(`${relativePath}: 必须分开开发评测集与冻结测试集`);
  }
}

const alignmentLessonSource = await readFile(path.join(root, "01-14天理论课/D12-对齐、强化学习与评测.md"), "utf8");
if (!alignmentLessonSource.includes("在查看结果前已独立抽样并固定为两批")) {
  errors.push("D12 分批合格率练习必须说明两批测试样本在查看结果前已经确定");
}

const foundationalConceptBridges = [
  ["01-14天理论课/D01-大模型到底是什么.md", "## 先分清模型、架构、权重和基座"],
  ["01-14天理论课/D04-神经网络如何学习.md", "## 一次学习中的角色"],
  ["01-14天理论课/D08-训练数据与分词器.md", "## “监督”不等于必须人工写答案"],
  ["01-14天理论课/D11-SFT、LoRA与QLoRA.md", "## 微调先看起点、目标和更新范围"],
  ["01-14天理论课/D12-对齐、强化学习与评测.md", "## 先把对齐和强化学习的角色排好"],
  ["01-14天理论课/D12-对齐、强化学习与评测.md", "## 评测不是只跑一个排行榜"],
  ["01-14天理论课/D13-推理、部署、RAG与Agent.md", "## 从模型推理到部署产品"],
  ["06-拓展知识库/多模态基础/01-从模态到张量.md", "## 四种输入"],
  ["06-拓展知识库/多模态基础/01-从模态到张量.md", "## 离散与连续表示"]
];
for (const [relativePath, heading] of foundationalConceptBridges) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  if (!source.includes(heading)) {
    errors.push(`${relativePath}: 缺少基础概念桥接段落 ${heading}`);
  }
}

const modelSelectionReferencePages = [
  ["06-拓展知识库/模型评测与选型/README.md", [
    "只保留两页",
    "当前榜单",
    "读榜与选型",
    "45 天"
  ]],
  ["06-拓展知识库/模型评测与选型/01-先定义模型选择合同.md", [
    "LiveBench",
    "Arena",
    "Artificial Analysis",
    "SWE-bench",
    "MTEB",
    "其他专项榜单",
    "官方入口"
  ]],
  ["06-拓展知识库/模型评测与选型/02-把评分指标翻成大白话.md", [
    "一眼读懂一根柱子",
    "指标翻译",
    "HELM",
    "OpenCompass",
    "MTEB",
    "按场景选榜单",
    "复核条件",
    "最后本地复测",
    "不能跨榜相加"
  ]]
];
const forbiddenReferenceScaffolding = [
  "> **学习导航**：",
  "## 本课目标",
  "## 为什么要学这一课",
  "## 本课验收",
  "## 方法边界",
  "```benchmark-terms"
];
for (const [relativePath, markers] of modelSelectionReferencePages) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) errors.push(`${relativePath}: 榜单参考页不得缺失 ${marker}`);
  }
  for (const marker of forbiddenReferenceScaffolding) {
    if (source.includes(marker)) errors.push(`${relativePath}: 榜单参考页不得套用课程模板 ${marker}`);
  }
}

for (const relativePath of [
  "06-拓展知识库/模型评测与选型/01-先定义模型选择合同.md"
]) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  const modelCardLinks = source.match(/https:\/\/huggingface\.co\/[^)\s]+\/blob\/[^)\s]+/g) ?? [];
  if (!modelCardLinks.length) errors.push(`${relativePath}: 日期快照至少需要一个模型卡证据链接`);
  for (const link of modelCardLinks) {
    if (!/^https:\/\/huggingface\.co\/[^/\s]+\/[^/\s]+\/blob\/[0-9a-f]{40}\/README\.md$/.test(link)) {
      errors.push(`${relativePath}: 日期快照模型卡必须固定到 40 位 commit SHA：${link}`);
    }
  }
}

const currentModelSnapshotSource = await readFile(
  path.join(root, "06-拓展知识库/模型评测与选型/01-先定义模型选择合同.md"),
  "utf8"
);
if (currentModelSnapshotSource.includes("甚至更长输出")) {
  errors.push("当前榜单页不得把 GLM-5.2 的已披露最大输出预算写成更长输出");
}

for (const termName of [
  "language model",
  "large language model",
  "neural network",
  "model architecture",
  "model weights",
  "base model",
  "exponent",
  "exponentiation",
  "supervision signal",
  "self-supervised learning",
  "fine-tuning",
  "model alignment",
  "model evaluation",
  "inference",
  "model deployment",
  "modality",
  "multimodal model"
]) {
  if (!wikiTerms.some((term) => term.term === termName)) {
    errors.push(`Wiki 缺少高频基础概念：${termName}`);
  }
}

const troubleshootingSource = await readFile(path.join(root, "05-速查表/训练排错.md"), "utf8");
if (!troubleshootingSource.includes("不要求安装环境、运行命令、修改配置或训练模型")) {
  errors.push("训练排错页必须保持纯前端审阅边界，不得要求学习者实际操作环境或训练");
}

const runtimeLessonSource = await readFile(path.join(root, "01-14天理论课/D07-模型一次运行到底发生什么.md"), "utf8");
for (const marker of [
  '"measureLabel": "缓存元素估算"',
  "2(K/V) × N_layer × B × Hkv × S_cache × Dh 个数值",
  "单个 K 或 V 张量可按 (B,Hkv,S_cache,Dh) 理解",
  "得到的是全部缓存的元素估算，不是一个张量的 shape",
  "生成后处理",
  "汇总继续条件",
  "不继续 → 结束或转交",
  "继续 → 作为下一模型位置",
  "应用约束、分数处理与选择规则",
  '"shape": "(B,V) → (B,)"',
  "每条活跃序列各接受 1 个 ID",
  "文本缓冲满足提交条件才显示",
  "本轮却可能没有新的可见字符",
  "只有未停止的序列才会进入下一轮",
  "已停止序列不再产生有效 token",
  "未停止才送入 ID",
  "生成循环汇总 EOS、长度、停止字符串与应用规则",
  "已接受 ID 记录与下一轮模型输入分开",
  "EOS 可以保留在已接受 ID 记录里，但通常不显示，也不再作为下一模型输入",
  "停止字符串需要 token 或增量文本缓冲跨轮匹配"
]) {
  if (!runtimeLessonSource.includes(marker)) errors.push(`D07 必须区分单张量 shape 与跨层缓存元素估算：${marker}`);
}
for (const forbidden of [
  "2(K/V) × L × B × Hkv × T × Dh",
  "greedy / temperature / top-p",
  "追加到上下文",
  "已接受 ID 同时用于显示和下一轮",
  "接受 token 后立即分成两条用途",
  '"id": "q7", "from": "accepted", "to": "decode-forward", "label": "作为下一位置输入"',
  '"id": "grow", "from": "select", "to": "append", "label": "加入下一轮"',
  '"shape": "(B,V) → 1 个 ID"',
  '"shape": "(B,V) → ID"',
  "它被反分词显示，同时追加回 token 序列",
  '"label": "经缓冲/过滤后显示"',
  "已停止的序列会从活跃 batch 中移除",
  "它成为下一位置的输入，并读取历史 K/V",
  "应用层先缓冲并逐序列判断停止",
  "应用层按停止条件决定结束或继续",
  '"owner": "应用层" },\n        { "id": "stop-check"'
]) {
  if (runtimeLessonSource.includes(forbidden)) errors.push(`D07 不得把继续 decode 画成无条件路径：${forbidden}`);
}

const globalKnowledgeMapSource = await readFile(path.join(root, "00-从这里开始/全局知识图谱.md"), "utf8");
for (const marker of [
  '"from": "tokenize", "to": "embedding", "label": "ID 查表"',
  '"from": "position", "to": "block", "label": "按架构接入位置线索"',
  "(B,V) → (B,)",
  "应用处理后可选输出",
  "未停止才加入新位置",
  "RoPE 在注意力内部作用于 Q/K",
  "相对位置偏置作用于注意力分数"
]) {
  if (!globalKnowledgeMapSource.includes(marker)) errors.push(`全局知识图谱必须保留真实推理与位置机制路径：${marker}`);
}
for (const forbidden of [
  '"from": "position", "to": "embedding"',
  "(B,V) → 1 个 ID"
]) {
  if (globalKnowledgeMapSource.includes(forbidden)) errors.push(`全局知识图谱不得固化错误路径或丢失 batch 轴：${forbidden}`);
}

const runtimeFence = extractFences(runtimeLessonSource, "01-14天理论课/D07-模型一次运行到底发生什么.md")
  .find((fence) => fence.language === "model-runtime");
if (runtimeFence) {
  try {
    const runtimeSpec = JSON.parse(runtimeFence.content);
    const inferenceMode = runtimeSpec.modes?.find((mode) => mode.id === "inference");
    const applicationStep = inferenceMode?.steps?.find((step) => step.title === "各活跃序列进入生成后处理");
    if (applicationStep?.active?.includes("decode-forward")) {
      errors.push("D07 生成后处理步骤不得提前点亮 decode-forward；应在下一步的未停止分支中点亮");
    }
    const q4 = inferenceMode?.edges?.find((edge) => edge.id === "q4");
    if (q4?.label === "greedy / temperature / top-p") {
      errors.push("D07 q4 边标签不得把选择规则、温度和候选过滤写成互斥选项");
    }
  } catch {
    // JSON validity is reported by validatePencilFence above.
  }
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

const referenceOnlySources = new Set([
  ...markdownFiles
    .map((file) => path.relative(root, file).replaceAll("\\", "/"))
    .filter((source) => source === "README.md" || source.endsWith("/README.md")),
  ...topicLessons.filter((lesson) => lesson.kind === "reference").map((lesson) => lesson.source),
  ...paperSurveyLessons.filter((lesson) => lesson.kind === "reference").map((lesson) => lesson.source),
  "00-从这里开始/全局知识图谱.md",
  "00-从这里开始/学科地图.md",
  "05-速查表/公式速查.md",
  "05-速查表/术语速查.md",
  "06-拓展知识库/前沿瓶颈地图.md",
  "06-拓展知识库/论文研读/README.md"
]);
for (const source of referenceOnlySources) {
  if (learningSources.has(source)) errors.push(`目录、地图或榜单参考页不得登记为学习进度单元：${source}`);
  const referenceSource = await readFile(path.join(root, source), "utf8");
  for (const marker of forbiddenReferenceScaffolding) {
    if (referenceSource.includes(marker)) errors.push(`${source}: 参考页不得套用课程模板 ${marker}`);
  }
}

const deletedLowDensityPages = [
  "00-从这里开始/21天路线图.md",
  "00-从这里开始/每日打卡表.md",
  "00-从这里开始/基础闭环路线.md",
  "00-从这里开始/能力路线.md",
  "00-从这里开始/学前自测.md",
  "00-从这里开始/课程为什么这样安排.md",
  "00-从这里开始/环境与硬件选择.md",
  "00-从这里开始/学习目标与边界.md",
  "01-14天理论课/D07-模型如何生成文字.md",
  "01-14天理论课/D09-一次完整训练循环.md",
  "01-14天理论课/D14-多模态、应用全景与总复习.md",
  "02-第3周实战/README.md",
  "06-拓展知识库/实际模型项目/README.md",
  "06-拓展知识库/模型后训练/README.md",
  "06-拓展知识库/多模态基础/README.md",
  "06-拓展知识库/幻觉与可靠性/README.md",
  "06-拓展知识库/推理控制与服务行为/README.md",
  "06-拓展知识库/软硬件瓶颈/README.md",
  "06-拓展知识库/小模型与蒸馏/README.md",
  "06-拓展知识库/在策略蒸馏深读/README.md",
  "06-拓展知识库/论文研读/GLM深读/README.md",
  "06-拓展知识库/论文研读/Kimi深读/README.md",
  "06-拓展知识库/论文研读/DeepSeek深读/README.md",
  "06-拓展知识库/论文研读/Qwen深读/README.md"
];
for (const source of deletedLowDensityPages) {
  if (await exists(path.join(root, source))) {
    errors.push(`已合并或废弃的低密度页面不得恢复：${source}`);
  }
}

const visualSupportUnits = learningUnits.filter((unit) =>
  unit.source.startsWith("04-图解与数字漫画/")
);
for (const unit of visualSupportUnits) {
  const source = await readFile(path.join(root, unit.source), "utf8");
  const isRoadmapPage = /^```generation-roadmap$/m.test(source);
  const requiredSections = isRoadmapPage
    ? [
        ["> **学习导航**：", "缺少承接关系和扫读顺序"],
        ['"learningGoal":', "路线图缺少学习必要性"],
        ['"watchFor":', "路线图缺少看图目标"],
        ["## 本页验收", "缺少迁移验收"],
        ['"boundary":', "路线图缺少简化条件和适用边界"]
      ]
    : [
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

const algorithmDirectory = "09-模型算法图解";
const algorithmOverviewFile = `${algorithmDirectory}/README.md`;
const registeredAlgorithmFiles = new Set(algorithmLessons.map((lesson) => path.basename(lesson.source)));
const actualAlgorithmFiles = (await readdir(path.join(root, algorithmDirectory)))
  .filter((file) => file.endsWith(".md") && file !== "README.md")
  .sort();

for (const file of actualAlgorithmFiles) {
  if (!registeredAlgorithmFiles.has(file)) errors.push(`${algorithmDirectory}/${file}: 算法章节未登记到 algorithmLessons`);
}
for (const file of registeredAlgorithmFiles) {
  if (!actualAlgorithmFiles.includes(file)) errors.push(`${algorithmDirectory}/${file}: algorithmLessons 登记了不存在的章节`);
}

const algorithmOverviewSource = await readFile(path.join(root, algorithmOverviewFile), "utf8");
for (const requiredText of ["按课程责任覆盖", "不是“全部模型算法大全”", "目前只有独立图解"]) {
  if (!algorithmOverviewSource.includes(requiredText)) {
    errors.push(`${algorithmOverviewFile}: 缺少完整性边界 ${requiredText}`);
  }
}

for (const [index, lesson] of algorithmLessons.entries()) {
  const sourcePath = path.join(root, lesson.source);
  const fileName = path.basename(lesson.source);
  const expectedPrefix = `${String(index + 1).padStart(2, "0")}-`;
  if (!fileName.startsWith(expectedPrefix)) {
    errors.push(`${lesson.source}: 算法章节编号应以 ${expectedPrefix} 开头`);
  }
  if (!algorithmOverviewSource.includes(`(${fileName})`)) {
    errors.push(`${algorithmOverviewFile}: 缺少算法章节链接 ${fileName}`);
  }
  if (!(await exists(sourcePath))) {
    errors.push(`${lesson.source}: 算法图解文件不存在`);
    continue;
  }
  const source = await readFile(sourcePath, "utf8");
  for (const [marker, message] of [
    ["> **看图目标**：", "缺少看图目标"],
    ["## 为什么需要它", "缺少算法要解决的问题"],
    ["## 主图", "缺少算法主图"],
    ["## 为什么不是随便设计的", "缺少机制推导与删项检查"],
    ["## 对照图", "缺少算法对照图"],
    ["## 生命周期位置", "缺少生命周期位置"],
    ["## 同一位置的不同选择", "缺少同节点算法选择对照"],
    ["## 采用判断", "缺少采用判断"],
    ["| 主要优势 |", "缺少主要优势"],
    ["| 主要局限 |", "缺少主要局限"],
    ["| 适合考虑 |", "缺少适用条件"],
    ["| 不适合直接采用 |", "缺少拒绝条件"],
    ["| 采用后必须检查 |", "缺少采用后检查"],
    ["## 看图复述", "缺少非计算验收"],
    ["## 方法边界", "缺少方法边界"]
  ]) {
    if (!source.includes(marker)) errors.push(`${lesson.source}: ${message}`);
  }

  const sectionSource = (heading) => {
    const marker = `## ${heading}`;
    const start = source.indexOf(marker);
    if (start < 0) return "";
    const next = source.indexOf("\n## ", start + marker.length);
    return source.slice(start + marker.length, next < 0 ? source.length : next);
  };
  for (const heading of ["主图", "对照图", "生命周期位置"]) {
    if (!sectionSource(heading).includes("```mermaid")) {
      errors.push(`${lesson.source}: ${heading}栏目必须直接包含 Mermaid 图`);
    }
  }

  const decisionSection = sectionSource("采用判断");
  for (const label of ["主要优势", "主要局限", "适合考虑", "不适合直接采用", "采用后必须检查"]) {
    const row = decisionSection.match(new RegExp(`^\\|\\s*${label}\\s*\\|\\s*([^|\\n]+?)\\s*\\|\\s*$`, "m"));
    if (!row || row[1].trim().length < 8) errors.push(`${lesson.source}: 采用判断 ${label} 缺少实质内容`);
  }
  if (decisionSection.includes("视情况而定")) errors.push(`${lesson.source}: 采用判断不得使用“视情况而定”代替条件`);

  const mechanismSection = sectionSource("为什么不是随便设计的");
  const mechanismRows = mechanismSection.match(/^\|\s*[^|\n]+\s*\|\s*[^|\n]+(?:\s*\|\s*[^|\n]+)?\s*\|\s*$/gm) ?? [];
  if (mechanismSection.trim().length < 120 || mechanismRows.length < 4) {
    errors.push(`${lesson.source}: 机制推导必须包含实质解释和至少两项删减、固定值或错误替换对照`);
  }

  const recallQuestionCount = (sectionSource("看图复述").match(/^\d+\.\s+\S.+$/gm) ?? []).length;
  if (recallQuestionCount < 3) errors.push(`${lesson.source}: 看图复述至少需要 3 个可回答问题`);
  const boundaryItemCount = (sectionSource("方法边界").match(/^-\s+\S.+$/gm) ?? []).length;
  if (boundaryItemCount < 3) errors.push(`${lesson.source}: 方法边界至少需要 3 条具体限制`);

  const diagramCount = extractFences(source, lesson.source)
    .filter((fence) => fence.language === "mermaid").length;
  if (diagramCount < 3) errors.push(`${lesson.source}: 每章至少需要 3 个 Mermaid 图（主图、对照图、生命周期图）`);
}

const formulaEvidenceRequirements = new Map([
  ["03-数学急救包/01-数、比例与平均数.md", ["为什么是“事件数除以机会数”", "去掉权重"]],
  ["03-数学急救包/02-向量、矩阵与点积.md", ["## 构造理由与删项检查", "去掉 $b$"]],
  ["03-数学急救包/03-概率与softmax.md", ["## 为什么必须先做指数运算再除总和", "去掉分母"]],
  ["03-数学急救包/04-导数、梯度与学习率.md", ["## 负号不是约定出来的", "把减号改成加号"]],
  ["03-数学急救包/05-对数与交叉熵.md", ["## 为什么是负对数", "去掉负号"]],
  ["03-数学急救包/06-外积与状态矩阵.md", ["## 从读取目标反推擦写项", "去掉擦除项"]],
  ["03-数学急救包/07-分位数与平滑封顶.md", ["两处 $\\beta$ 分工不同", "漏掉 $k$"]],
  ["01-14天理论课/D01-大模型到底是什么.md", ["去掉“已有 token”", "不能直接按概率解释"]],
  ["01-14天理论课/D03-够用就好的数学基础.md", ["分母不是装饰", "零向量没有方向"]],
  ["01-14天理论课/D10-预训练与规模化训练.md", ["常数 6 来自一套估算口径", "有效吞吐"]],
  ["01-14天理论课/D11-SFT、LoRA与QLoRA.md", ["若两者都以零初始化", "少一项就等于漏记一个可训练矩阵"]],
  ["01-14天理论课/D14-监控、反馈与持续迭代.md", ["单条结果的方差是 $p(1-p)$", "漏掉开方"]],
  ["06-拓展知识库/小模型与蒸馏/02-训练一个可用的小模型.md", ["参数量回答“有多少个数”", "0.93 GiB"]],
  ["06-拓展知识库/小模型与蒸馏/03-模型蒸馏.md", ["去掉 $p_T(i)$", "等价于最小化 $\\mathrm{KL}(p_T\\|p_S)$"]],
  ["06-拓展知识库/在策略蒸馏深读/02-学生访问状态与重叠token.md", ["分母 `3`", "不能把两边概率质量只报成一个数"]],
  ["06-拓展知识库/软硬件瓶颈/01-指标与容量账本.md", ["每个乘数对应一个真实存储轴", "不能既在这里乘一次序列长度"]],
  ["06-拓展知识库/软硬件瓶颈/02-计算带宽与内存墙.md", ["内存边界必须声明", "高算术强度不等于低延迟"]],
  ["06-拓展知识库/软硬件瓶颈/06-Token生成速度与并行解码.md", ["来自条件概率的链式法则", "删掉条件不是提速技巧"]]
]);
for (const [relativePath, markers] of formulaEvidenceRequirements) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) errors.push(`${relativePath}: 核心公式证据缺少 ${marker}`);
  }
}

const mathAidOverview = await readFile(path.join(root, "03-数学急救包/README.md"), "utf8");
for (const marker of ["## 核心公式的六问读法", "问题来源", "构造过程", "参数职责", "删项检查", "反向白话", "成立边界"]) {
  if (!mathAidOverview.includes(marker)) errors.push(`03-数学急救包/README.md: 核心公式阅读合同缺少 ${marker}`);
}

const softmaxMathSource = await readFile(path.join(root, "03-数学急救包/03-概率与softmax.md"), "utf8");
for (const marker of [
  "### 先看懂 $e^z$：底数、幂指数与结果",
  "$e^{-1}=1/e$",
  "负指数给出介于 0 与 1 之间的正数",
  "单个 $e^z$ 还不是概率",
  "负底数配某些小数指数不一定有实数结果",
  "几个概率数值碰巧加到 1，也不能证明对应事件互斥且穷尽",
  "归一化权重约 [0.27,0.73]",
  "w_i=\\frac{e^{z_i}}{\\sum_{j=1}^{K}e^{z_j}}",
  "同一个公式的输出含义由“沿哪个轴算、后面拿它做什么”决定",
  "标准计算并没有据此随机选中一个位置",
  "互斥且穷尽模型目标空间的类别",
  "开放集输入仍可能被迫分给已有类别",
  "当 $z_1,\\ldots,z_K$ 都是有限实数时",
  "只对至少一个可见位置做 softmax，再令被遮罩位置权重为 0",
  "某一行没有任何可见位置，普通公式会变成无有效分母，数学上无定义",
  "浮点计算也可能把极小权重下溢成 0",
  "总和不受约束，不能保证为 1",
  "虽碰巧为 1，仍没有执行归一化",
  "不能自动把单个 token 的 softmax 概率变成整段答案的事实正确率",
  "全同分输入在任意 $T>0$ 下仍为 `[0.5,0.5]`",
  "若有 $m$ 个并列最大项，极限在这 $m$ 项上各为 $1/m$",
  "可能拒绝该值、忽略温度、切换到确定性选择",
  "最终选择行为还取决于这些规则"
]) {
  if (!softmaxMathSource.includes(marker)) errors.push(`概率与 Softmax 必须保留指数运算基础：${marker}`);
}
for (const forbidden of [
  "只有在**彼此互斥且穷尽当前样本空间**时，概率总和才是 1",
  '"name": "概率约 [0.27,0.73]"',
  "得到总和为一的概率",
  '"goal": "指数运算负责把任意实数变成正权重，总和分母负责把全部候选约束到同一份概率质量中。"',
  "每个 $p_i$ 都大于 0，全部 $p_i$ 的和为 1",
  "softmax 概率不变。例如 `[1000,1001]`",
  "logits `[0,0]` 的 softmax 概率是多少",
  "都是正数，但总和不等于 1",
  "通常约定为贪心选择",
  "要把分数解释成长期正确率，还需要单独做置信度校准",
  "它不改变 logits 的高低顺序，但会改变采样概率"
]) {
  if (softmaxMathSource.includes(forbidden)) errors.push(`概率与 Softmax 不得保留缺少成立条件的结论：${forbidden}`);
}

const formulaReference = await readFile(path.join(root, "05-速查表/公式速查.md"), "utf8");
for (const header of ["为什么这样构造", "少一项会怎样", "深入"]) {
  if (!formulaReference.includes(`| ${header}`) && !formulaReference.includes(`| ${header} |`)) {
    errors.push(`05-速查表/公式速查.md: 公式速查缺少 ${header} 列`);
  }
}

const unreviewedInnovationMarkers = ["创新待评审", "草案公式", "待数学审查", "待实验公式"];
for (const markdownPath of markdownFiles) {
  const source = await readFile(markdownPath, "utf8");
  const relativePath = path.relative(root, markdownPath).replaceAll("\\", "/");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) {
    errors.push(`${relativePath}: 包含不可见控制字符，可能破坏公式或正文渲染`);
  }
  for (const marker of unreviewedInnovationMarkers) {
    if (source.includes(marker)) errors.push(`${relativePath}: 学习者内容不得出现未通过的创新标记 ${marker}`);
  }
  if (/\bINNOV-\d{4,}\b/.test(source)) {
    errors.push(`${relativePath}: 学习者内容不得直接引用内部创新登记编号`);
  }
}

const innovationRegistryPath = path.join(repoRoot, "internal/来源与质量审计/公式与算法创新待评审.md");
if (!(await exists(innovationRegistryPath))) {
  errors.push("缺少公式与算法创新待评审清单");
} else {
  const innovationRegistry = await readFile(innovationRegistryPath, "utf8");
  for (const field of ["编号", "提案公式或方法", "来源类型", "动机", "推导", "参数与形状", "可反驳条件", "与既有方法差异", "需要的评审或实验", "状态", "评审记录"]) {
    if (!innovationRegistry.includes(`| ${field} |`)) errors.push(`公式与算法创新待评审.md: 登记模板缺少 ${field}`);
  }
  for (const status of ["草案", "待数学审查", "待实验", "通过", "驳回"]) {
    if (!innovationRegistry.includes(status)) errors.push(`公式与算法创新待评审.md: 缺少状态 ${status}`);
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

const layoutComponent = await readFile(path.join(repoRoot, ".vitepress/theme/Layout.vue"), "utf8");
const docBeforeSlot = layoutComponent.match(/<template #doc-before>([\s\S]*?)<\/template>/)?.[1] ?? "";
const docFooterBeforeSlot = layoutComponent.match(/<template #doc-footer-before>([\s\S]*?)<\/template>/)?.[1] ?? "";
if (!docFooterBeforeSlot.includes("<LessonToolbar />")) {
  errors.push("课程完成操作必须放在正文末尾、上一课和下一课导航之前");
}
if (docBeforeSlot.includes("<LessonToolbar />")) {
  errors.push("课程开始位置不得再次出现完成学习操作");
}

for (const lesson of topicLessons) {
  if (lesson.kind === "reference") continue;
  const sourcePath = path.join(root, lesson.source);
  if (!(await exists(sourcePath))) {
    errors.push(`${lesson.source}: 专题课程单元文件不存在`);
    continue;
  }

  const source = await readFile(sourcePath, "utf8");
  if (!source.includes("> **学习导航**：")) {
    errors.push(`${lesson.source}: 缺少专题学习导航`);
  }
  const learningNavigation = source.match(/^> \*\*学习导航\*\*：(.+)$/mu)?.[1] ?? "";
  if (!/(完成后|学完后|完成证据)/u.test(learningNavigation)) {
    errors.push(`${lesson.source}: 学习导航必须直接给出可观察的完成证据`);
  }
  if (source.includes("## 本课目标")) {
    errors.push(`${lesson.source}: 专题目标已并入学习导航，不得恢复重复的本课目标栏目`);
  }
  if (!source.includes("## 为什么要学这一课") && !source.includes("## 本课核心判断")) {
    errors.push(`${lesson.source}: 缺少从真实问题解释学习必要性的章节`);
  }
  if (!source.includes("## 本课验收")) {
    errors.push(`${lesson.source}: 缺少专题单元验收问题`);
  }
  if (!source.includes("## 方法边界")) {
    errors.push(`${lesson.source}: 缺少方法边界`);
  }
}

const condensedTopicPrefixes = [
  "06-拓展知识库/实际模型项目/",
  "06-拓展知识库/模型后训练/",
  "06-拓展知识库/幻觉与可靠性/",
  "06-拓展知识库/多模态基础/",
  "06-拓展知识库/小模型与蒸馏/",
  "06-拓展知识库/在策略蒸馏深读/",
  "06-拓展知识库/推理控制与服务行为/",
  "06-拓展知识库/软硬件瓶颈/"
];
const repeatedCourseRouteHeading = /^## (?:项目路线图|[四五七]步路线|七步诊断路线|三课路线与证据边界)$/mu;
for (const unit of learningUnits.filter((item) =>
  condensedTopicPrefixes.some((prefix) => item.source.startsWith(prefix))
)) {
  const source = await readFile(path.join(root, unit.source), "utf8");
  const learningNavigation = source.match(/^> \*\*学习导航\*\*：(.+)$/mu)?.[1] ?? "";
  if (!/(完成后|学完后|完成证据)/u.test(learningNavigation)) {
    errors.push(`${unit.source}: 精炼专题的学习导航必须包含可观察完成证据`);
  }
  if (source.includes("## 本课目标")) {
    errors.push(`${unit.source}: 精炼专题不得恢复与学习导航重复的本课目标`);
  }
  if (repeatedCourseRouteHeading.test(source)) {
    errors.push(`${unit.source}: 不得用正文路线清单重复侧栏课程顺序`);
  }
}

const theoryCount = courseLessons.filter((lesson) => lesson.phase === "理论").length;
const caseCount = courseLessons.filter((lesson) => lesson.phase === "案例").length;
if (theoryCount !== 14 || caseCount !== 7) {
  errors.push(`基础闭环单元异常：理论 ${theoryCount}，案例 ${caseCount}`);
}

function collectSidebarLinks(items = []) {
  return items.flatMap((item) => [item.link, ...collectSidebarLinks(item.items)].filter(Boolean));
}

function collectSidebarGroupLinks(groups = []) {
  return groups.flatMap((group) => collectSidebarLinks(group.items));
}

if (!Array.isArray(sidebar)) {
  errors.push("课程侧栏必须是所有页面共用的一棵全站目录，不能再按路径替换局部侧栏");
}

const expectedGlobalSidebarLabels = ["从这里开始", "基础课程", "专题课程", "论文研读", "查阅工具", "支持课程"];
const actualGlobalSidebarLabels = Array.isArray(sidebar) ? sidebar.map((item) => item.text) : [];
if (JSON.stringify(actualGlobalSidebarLabels) !== JSON.stringify(expectedGlobalSidebarLabels)) {
  errors.push(`全站侧栏必须始终显示全部一级目录：${actualGlobalSidebarLabels.join(" -> ")}`);
}
const collapsedGlobalGroups = Array.isArray(sidebar)
  ? sidebar.filter((item) => item.items).map((item) => [item.text, item.collapsed])
  : [];
if (collapsedGlobalGroups.some(([, collapsed]) => collapsed !== true)) {
  errors.push(`全站侧栏一级分组必须可折叠，并由当前页面自动展开：${JSON.stringify(collapsedGlobalGroups)}`);
}
const expectedGlobalBranches = [
  ["基础课程", ["理论基础", "训练过程案例", "模型算法图解"]],
  ["专题课程", ["进阶专题总览", "前沿瓶颈地图", "实际模型案例", "模型评测与选型", "模型后训练", "小模型与蒸馏", "多模态基础", "幻觉与可靠性", "推理控制与服务行为", "软硬件瓶颈", "在策略蒸馏"]],
  ["论文研读", ["论文导览", "模型系列", "研究问题", "跨系列专题"]],
  ["查阅工具", ["数学急救包", "图解与动画", "速查表"]]
];
for (const [branch, expectedItems] of expectedGlobalBranches) {
  const actualItems = sidebar.find((item) => item.text === branch)?.items?.map((item) => item.text) ?? [];
  if (JSON.stringify(actualItems) !== JSON.stringify(expectedItems)) {
    errors.push(`${branch} 必须完整保留在全站侧栏中：${actualItems.join(" -> ")}`);
  }
}

const referenceNav = primaryNav.find((item) => item.text === "查阅工具");
const expectedReferenceNav = [
  ["方法选择", "/05-速查表/方法选择"],
  ["术语速查", "/05-速查表/术语速查"],
  ["公式速查", "/05-速查表/公式速查"],
  ["数学急救包", "/03-数学急救包/"],
  ["图解与动画", "/04-图解与数字漫画/"]
];
const actualReferenceNav = referenceNav?.items?.map((item) => [item.text, item.link]);
if (JSON.stringify(actualReferenceNav) !== JSON.stringify(expectedReferenceNav)) {
  errors.push("查阅工具必须分别提供方法、术语、公式、数学和图解入口，不能把“速查”直接指向单一页面");
}

const mermaidRendererSource = await readFile(
  path.join(repoRoot, ".vitepress/theme/components/MermaidDiagram.vue"),
  "utf8"
);
if (!mermaidRendererSource.includes("流程图加载中") || !mermaidRendererSource.includes(":aria-busy=\"loading\"")) {
  errors.push("Mermaid 图必须在异步分包与渲染完成前显示准确的加载状态");
}
if (mermaidRendererSource.includes("target.replaceChildren();")) {
  errors.push("Mermaid 重新渲染不能先清空已有 SVG");
}
const mermaidStylesSource = await readFile(
  path.join(repoRoot, ".vitepress/theme/custom.css"),
  "utf8"
);
if (!/\.mermaid-canvas\s+foreignObject\s*\{[^}]*overflow:\s*visible;/s.test(mermaidStylesSource)) {
  errors.push("Mermaid HTML 标签必须允许中日韩字体的右侧字形外伸，不能裁切节点末字");
}
for (const marker of [
  ".generation-roadmap-details::before",
  ".generation-roadmap-details::after",
  ".generation-roadmap-details > div::after",
  "border-left: 2px dashed var(--roadmap-detail)"
]) {
  if (!mermaidStylesSource.includes(marker)) {
    errors.push(`连续生成路线图必须保留同源分叉树及移动端纵向主干：${marker}`);
  }
}
const generationRoadmapComponentSource = await readFile(
  path.join(repoRoot, ".vitepress/theme/components/GenerationRoadmap.vue"),
  "utf8"
);
for (const marker of [
  'class="generation-roadmap-return-line"',
  'data-stage-number="05"',
  'marker-end="url(#generation-roadmap-return-arrow)"',
  "targetX = targetRect.left - rootRect.left"
]) {
  if (!generationRoadmapComponentSource.includes(marker)) {
    errors.push(`连续生成路线图的 decode 回边必须真实指向第 05 步：${marker}`);
  }
}
if (!mermaidStylesSource.includes(".generation-roadmap-return-line")) {
  errors.push("连续生成路线图的 decode 回边必须保留可见 SVG 样式");
}

const startSidebarGroup = sidebar.find((item) => item.text === "从这里开始");
const startLinks = collectSidebarLinks(startSidebarGroup?.items);
if (!startLinks.includes("/00-从这里开始/学习记录与复习")) {
  errors.push("开始区域必须提供学习记录与复习入口");
}
const continuousStartLinks = collectSidebarLinks(startSidebarGroup?.items);
const expectedContinuousStartLinks = [
  "/00-从这里开始/",
  "/00-从这里开始/学科地图",
  "/00-从这里开始/全局知识图谱",
  "/00-从这里开始/学习记录与复习"
];
if (JSON.stringify(continuousStartLinks) !== JSON.stringify(expectedContinuousStartLinks)) {
  errors.push(`全站侧栏的“从这里开始”分支必须连续显示本区域入口，不能复制基础课程或专题链接：${continuousStartLinks.join(" -> ")}`);
}
const beginnerEntryPages = [
  ["README.md", "## 第一次来：直接开始", "(01-14天理论课/D01-大模型到底是什么.md)"],
  ["00-从这里开始/README.md", "## 第一次学习只做三件事", "(../01-14天理论课/D01-大模型到底是什么.md)"]
];
for (const [relativePath, heading, d01Link] of beginnerEntryPages) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  if (!source.includes(heading) || !source.includes(d01Link)) {
    errors.push(`${relativePath}: 零基础入口必须先给出直达 D01 的默认动作`);
  }
}

const allSidebarLinks = collectSidebarLinks(sidebar);
const duplicateSidebarLinks = [...new Set(allSidebarLinks.filter((link, index) => allSidebarLinks.indexOf(link) !== index))];
if (duplicateSidebarLinks.length > 0) {
  errors.push(`全站侧栏中的页面只能出现一次，否则会同时展开多个分支并破坏分页顺序：${duplicateSidebarLinks.join("、")}`);
}
if (allSidebarLinks.some((link) => link.startsWith("/internal/来源与质量审计"))) {
  errors.push("内部质量审计页面不得出现在用户课程侧栏");
}
const internalLearningUnit = learningUnits.find(
  (unit) => unit.source.startsWith("internal/来源与质量审计/") || ["论文速研工作台", "论文证据卡", "审技术报告"].some((label) => unit.title.includes(label))
);
if (internalLearningUnit) {
  errors.push(`内部生产资料不得登记为学习单元：${internalLearningUnit.source}`);
}
const basicCourseSidebar = sidebar.find((item) => item.text === "基础课程");
const theorySidebar = basicCourseSidebar?.items?.find((item) => item.text === "理论基础");
const expectedTheoryGroups = [
  "模型原理",
  "模型架构与运行",
  "数据准备与模型训练",
  "模型评估与优化",
  "推理、部署与应用",
  "监控、反馈与迭代"
];
const actualTheoryGroups = theorySidebar?.items?.filter((item) => item.items).map((item) => item.text) ?? [];
if (JSON.stringify(actualTheoryGroups) !== JSON.stringify(expectedTheoryGroups)) {
  errors.push(`理论基础局部目录没有按生命周期主线组织：${actualTheoryGroups.join(" -> ")}`);
}
const fixedTheoryGroups = theorySidebar?.items
  ?.filter((item) => item.items && item.collapsed !== true)
  .map((item) => item.text) ?? [];
if (fixedTheoryGroups.length > 0) {
  errors.push(`理论基础必须保留六个可折叠二级分组：${fixedTheoryGroups.join("、")}`);
}
for (const [relativePath] of theoryOverviewPages) {
  const href = `/${relativePath.replace(/\.md$/, "")}`;
  if (!allSidebarLinks.includes(href)) errors.push(`理论基础侧栏缺少总纲入口：${href}`);
}
for (const obsoleteLink of ["/00-从这里开始/每日打卡表"]) {
  if (allSidebarLinks.includes(obsoleteLink)) {
    errors.push(`侧栏不得恢复无法操作的旧入口：${obsoleteLink}`);
  }
}

const trainingCaseSidebar = basicCourseSidebar?.items?.find((item) => item.text === "训练过程案例");
const expectedTrainingCaseLinks = [
  "/02-第3周实战/D15-确定目标与跑通基线",
  "/02-第3周实战/D16-准备和检查数据",
  "/02-第3周实战/数据卡模板",
  "/02-第3周实战/D17-搭建微型Transformer",
  "/02-第3周实战/D18-单批次过拟合与排错",
  "/02-第3周实战/D19-正式训练与保存检查点",
  "/02-第3周实战/D20-评测、生成与对照实验",
  "/02-第3周实战/D21-模型卡、复现与成果验收",
  "/02-第3周实战/模型卡模板"
];
const actualTrainingCaseLinks = collectSidebarLinks(trainingCaseSidebar?.items);
if (
  trainingCaseSidebar?.collapsed !== true ||
  JSON.stringify(actualTrainingCaseLinks) !== JSON.stringify(expectedTrainingCaseLinks)
) {
  errors.push(`训练过程案例分支必须按顺序包含全部课程与审查卡：${actualTrainingCaseLinks.join(" -> ")}`);
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

const tinyLlmSamplePath = path.join(repoRoot, "internal/训练代码/tiny-llm/data/sample.txt");
const tinyLlmSample = (await readFile(tinyLlmSamplePath, "utf8")).replace(/\r\n?/g, "\n");
const tinyLlmCharacterCount = [...tinyLlmSample].length;
const tinyLlmSourceCharacterCount = new Set([...tinyLlmSample]).size;
if (tinyLlmCharacterCount !== 1288 || tinyLlmSourceCharacterCount !== 417) {
  errors.push(`tiny-llm 冻结语料必须保持 1,288 个字符和 417 个不同字符，实际 ${tinyLlmCharacterCount}/${tinyLlmSourceCharacterCount}`);
}

const preparedCaseFiles = await collectMarkdown("02-第3周实战");
for (const file of preparedCaseFiles) {
  const source = await readFile(file, "utf8");
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  if (/1,?331/.test(source)) errors.push(`${relativePath}: 仍使用未按文本读取口径统计的 1,331 字符`);
  if (source.includes("7220daf58dc4")) errors.push(`${relativePath}: tiny-llm 代码快照指向不存在实现的提交`);
}

const tinyLlmEvidencePages = [
  "02-第3周实战/模型卡模板.md",
  "02-第3周实战/D21-模型卡、复现与成果验收.md"
];
for (const relativePath of tinyLlmEvidencePages) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const marker of ["95d627307a99", "130,432", "1,288"]) {
    if (!source.includes(marker)) errors.push(`${relativePath}: 缺少 tiny-llm 冻结证据 ${marker}`);
  }
}

const tinyLlmDataLesson = await readFile(path.join(root, "02-第3周实战/D16-准备和检查数据.md"), "utf8");
for (const marker of ["1,288", "1,159", "129", "417；再加 `<unk>` 后词表为 418"]) {
  if (!tinyLlmDataLesson.includes(marker)) errors.push(`D16 缺少与冻结语料一致的统计 ${marker}`);
}
if (!tinyLlmDataLesson.includes("[数据卡审查框架](数据卡模板.md)")) {
  errors.push("D16 正文导航必须先进入配套数据卡，再继续 D17");
}

const tinyLlmDataCard = await readFile(path.join(root, "02-第3周实战/数据卡模板.md"), "utf8");
for (const marker of ["95d627307a99", "internal/训练代码/tiny-llm/data/sample.txt", "[D17：跟着张量走过 Transformer](D17-搭建微型Transformer.md)"]) {
  if (!tinyLlmDataCard.includes(marker)) errors.push(`数据卡审查框架缺少版本或学习接力证据 ${marker}`);
}

const tinyLlmModelLesson = await readFile(path.join(root, "02-第3周实战/D21-模型卡、复现与成果验收.md"), "utf8");
if (!tinyLlmModelLesson.includes("[模型卡审查框架](模型卡模板.md)")) {
  errors.push("D21 正文导航必须进入配套模型卡审查框架");
}

for (const relativePath of ["02-第3周实战/数据卡模板.md", "02-第3周实战/模型卡模板.md"]) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  if (!/^---\r?\npageClass: review-card-page\r?\n---/m.test(source)) {
    errors.push(`${relativePath}: 审查卡必须启用窄屏纵向表格布局`);
  }
}
for (const marker of [
  ".review-card-page .vp-doc tbody tr",
  ".review-card-page .vp-doc tbody td:nth-child(3)::before",
  ".review-card-page .vp-doc tbody td code"
]) {
  if (!mermaidStylesSource.includes(marker)) errors.push(`审查卡缺少窄屏表格样式 ${marker}`);
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

const paperReadingGroups = sidebar.find((item) => item.text === "论文研读")?.items ?? [];
const paperReadingLinks = collectSidebarGroupLinks(paperReadingGroups);
const expectedPaperSections = ["论文导览", "模型系列", "研究问题", "跨系列专题"];
const actualPaperSections = paperReadingGroups.map((group) => group.text);
if (JSON.stringify(actualPaperSections) !== JSON.stringify(expectedPaperSections)) {
  errors.push(`全站侧栏的论文研读分支没有把导览、模型系列、研究问题和跨系列专题分清：${actualPaperSections.join(" -> ")}`);
}
if (
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/03-如何读懂一篇论文") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/01-论文库") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/02-跨系列问题地图") ||
  seriesPaperCourses.some((course) => !paperReadingLinks.includes(course.overview))
) {
  errors.push("论文研读入口必须同时提供阅读方法、知识图谱、材料库和各模型系列演进入口");
}
if (
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/04-GLM系列演进") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/05-Kimi系列演进") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/06-DeepSeek系列演进") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/07-Qwen系列演进") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/GLM深读/论文") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/Kimi深读/论文") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/DeepSeek深读/论文") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/Qwen深读/论文") ||
  !allSidebarLinks.includes("/06-拓展知识库/论文研读/Kimi深读/06-Kimi-K3技术报告")
) {
  errors.push("各模型系列局部目录必须同时提供系列路线、材料目录和逐篇课程；Kimi K3 必须收在 Kimi 系列中");
}

for (const lesson of courseLessons.filter((item) => item.phase === "理论")) {
  const source = await readFile(path.join(root, lesson.source), "utf8");
  const section = source.match(/## (?:本课验收|结业验收)\s*([\s\S]*?)(?=\n## |\n来源：|\n下一课：|$)/)?.[1] ?? "";
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

    const id = exercise.match(/\bid="([a-z0-9-]+)"/)?.[1];
    if (!id) errors.push(`${label} 缺少稳定的小写 ASCII id`);
    else if (stableExerciseIds.has(id)) errors.push(`${label} 的 id ${id} 与其他题重复`);
    else stableExerciseIds.add(id);

    if (lesson.day >= 2 && lesson.day <= 7) {
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

const exerciseComponent = await readFile(path.join(repoRoot, ".vitepress/theme/components/ExerciseBlock.vue"), "utf8");
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

if (pencilFlowCount < 2 || pencilVectorCount < 1 || pencilFormulaPlaneCount < 1 || pencil3dCount < 1) {
  errors.push(`铅笔视图不足：二维流程 ${pencilFlowCount}，向量 ${pencilVectorCount}，公式平面 ${pencilFormulaPlaneCount}，三维 ${pencil3dCount}`);
}

for (const [sourcePath, fence] of [
  ["01-14天理论课/D01-大模型到底是什么.md", "pencil-flow"],
  ["01-14天理论课/D02-文字如何变成数字.md", "pencil-flow"],
  ["01-14天理论课/D03-够用就好的数学基础.md", "pencil-formula-plane"],
  ["01-14天理论课/D03-够用就好的数学基础.md", "pencil-vector"],
  ["01-14天理论课/D07-模型一次运行到底发生什么.md", "pencil-flow"],
  ["00-从这里开始/全局知识图谱.md", "model-runtime"],
  ["01-14天理论课/D02-文字如何变成数字.md", "model-runtime"],
  ["01-14天理论课/D06-拼出完整Transformer.md", "model-runtime"],
  ["01-14天理论课/D07-模型一次运行到底发生什么.md", "model-runtime"],
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
  if (!term.summary.trim() || !term.usage?.trim() || !term.misconception.trim()) {
    errors.push(`Wiki 预览内容不完整：${term.term}`);
  }
  if (term.usage === term.summary) {
    errors.push(`Wiki 沟通示例不能复述定义：${term.term}`);
  }
  if (!/^沟通示例：.+[。？！]$/.test(term.usage ?? "")) {
    errors.push(`Wiki 沟通示例必须是带前缀和句末标点的完整句：${term.term}`);
  }
  if (/(?:很重要|需要了解|应该了解)/.test(term.usage ?? "")) {
    errors.push(`Wiki 沟通示例不能使用空泛句式：${term.term}`);
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

const concreteExampleTerms = [
  "token ID",
  "parameter",
  "random seed",
  "vector",
  "matrix",
  "hidden dimension",
  "tensor",
  "tensor shape",
  "vector norm",
  "cosine similarity",
  "Euclidean distance",
  "matrix rank",
  "logits",
  "softmax",
  "loss",
  "gradient",
  "gradient norm",
  "learning rate",
  "batch size",
  "effective batch size",
  "step",
  "epoch",
  "cross-entropy",
  "context window",
  "inference latency",
  "inference throughput",
  "TTFT",
  "TPOT",
  "FLOPs",
  "total parameters",
  "activated parameters"
];
for (const termName of concreteExampleTerms) {
  const term = wikiTerms.find((item) => item.term === termName);
  if (!term) {
    errors.push(`Wiki 缺少需要具体示例的术语：${termName}`);
    continue;
  }
  if (!term.summary.includes("例：")) {
    errors.push(`Wiki 术语必须说明对象类型并给出具体示例：${termName}`);
  }
  const glossaryLine = glossary.split(/\r?\n/).find((line) => line.includes(`id="${term.anchor}"`));
  if (!glossaryLine?.includes("例：")) {
    errors.push(`术语速查必须保留具体示例：${termName}`);
  }
}
const lossTerm = wikiTerms.find((term) => term.term === "loss");
if (!lossTerm?.summary.includes("损失函数") || !lossTerm.summary.includes("标量")) {
  errors.push("loss 定义必须区分损失函数与一次计算得到的标量");
}
const exponentTerm = wikiTerms.find((term) => term.term === "exponent");
if (exponentTerm?.aliases.includes("指数")) {
  errors.push("exponent 不得把多义的普通“指数”注册为自动链接别名，应使用“幂指数”等精确别名");
}

const runtimeLesson = await readFile(path.join(root, "01-14天理论课/D07-模型一次运行到底发生什么.md"), "utf8");
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
  path.join(repoRoot, "internal/来源与质量审计/Kimi-K3-素材审计.md"),
  "utf8"
);
for (const label of ["一手事实", "作者实验", "作者主张", "教学推导", "工程估算", "待核查"]) {
  if (!kimiK3Audit.includes(`| ${label} |`)) errors.push(`Kimi K3 素材审计缺少证据标签：${label}`);
}

if (!(await exists(supportImagePath))) {
  errors.push(`缺少原样打赏图片：${supportImage}`);
} else {
  const actualHash = createHash("sha256")
    .update(await readFile(supportImagePath))
    .digest("hex")
    .toUpperCase();
  if (actualHash !== supportImageSha256) {
    errors.push(`打赏图片不是原始文件：${supportImage}`);
  }
}

if (!(await exists(path.join(repoRoot, feedbackComponent)))) {
  errors.push(`缺少全局反馈组件：${feedbackComponent}`);
} else {
  const feedbackSource = await readFile(path.join(repoRoot, feedbackComponent), "utf8");
  for (const requiredText of [
    "VITE_FEEDBACK_ENDPOINT",
    "反馈类型",
    "一句话反馈",
    "提交反馈",
    "提交中...",
    "反馈已提交",
    "fetch(feedbackEndpoint"
  ]) {
    if (!feedbackSource.includes(requiredText)) {
      errors.push(`${feedbackComponent}: 缺少反馈约束 ${requiredText}`);
    }
  }
  if (/\bmaxlength=/.test(feedbackSource)) {
    errors.push(`${feedbackComponent}: 反馈长度应交由 GitHub Issue 处理，不得设置前端 maxlength`);
  }
  for (const forbiddenText of ["issues/new", "前往 GitHub 提交"]) {
    if (feedbackSource.includes(forbiddenText)) {
      errors.push(`${feedbackComponent}: 站内反馈不得再依赖 GitHub 跳转 ${forbiddenText}`);
    }
  }

  const layoutSource = await readFile(path.join(repoRoot, ".vitepress/theme/Layout.vue"), "utf8");
  if (!layoutSource.includes("<FeedbackFloat />")) {
    errors.push("全局布局缺少反馈入口：.vitepress/theme/Layout.vue");
  }
}

if (!(await exists(path.join(repoRoot, algorithmDecisionComponent)))) {
  errors.push(`缺少算法采用判断书签：${algorithmDecisionComponent}`);
} else {
  const algorithmDecisionSource = await readFile(path.join(repoRoot, algorithmDecisionComponent), "utf8");
  for (const requiredText of [
    "09-模型算法图解",
    "2[0-4]",
    "href=\"#采用判断\"",
    "algorithm-decision-float",
    "Layout:has(.algorithm-decision-float)"
  ]) {
    if (!algorithmDecisionSource.includes(requiredText)) {
      errors.push(`${algorithmDecisionComponent}: 缺少算法采用判断书签约束 ${requiredText}`);
    }
  }

  const layoutSource = await readFile(path.join(repoRoot, ".vitepress/theme/Layout.vue"), "utf8");
  if (!layoutSource.includes("<AlgorithmDecisionFloat />")) {
    errors.push("全局布局缺少算法采用判断书签：.vitepress/theme/Layout.vue");
  }
}

for (const requiredFile of [feedbackWorker, feedbackWorkerConfig]) {
  if (!(await exists(path.join(repoRoot, requiredFile)))) errors.push(`缺少反馈服务文件：${requiredFile}`);
}
if (await exists(path.join(repoRoot, feedbackWorker))) {
  const workerSource = await readFile(path.join(repoRoot, feedbackWorker), "utf8");
  for (const requiredText of [
    "api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues",
    "env.GITHUB_TOKEN",
    "env.RATE_LIMITER",
    "cf-connecting-ip",
    "access-control-allow-origin"
  ]) {
    if (!workerSource.includes(requiredText)) errors.push(`${feedbackWorker}: 缺少服务约束 ${requiredText}`);
  }
}
if (await exists(path.join(repoRoot, feedbackWorkerConfig))) {
  const workerConfig = JSON.parse(await readFile(path.join(repoRoot, feedbackWorkerConfig), "utf8"));
  if (workerConfig.name !== "llmtrain-feedback") errors.push(`${feedbackWorkerConfig}: Worker 名称必须为 llmtrain-feedback`);
  if (workerConfig.vars?.GITHUB_REPO !== "LLMTrain") errors.push(`${feedbackWorkerConfig}: GitHub 仓库目标必须为 LLMTrain`);
  if (JSON.stringify(workerConfig).includes("GITHUB_TOKEN")) {
    errors.push(`${feedbackWorkerConfig}: GitHub Token 只能写入 Worker Secret`);
  }
}

for (const runtime of visualizationRuntimes) {
  const target = path.join(repoRoot, runtime.file);
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
  if (!detailSource.includes(`~~~paper-family\n${family}\n~~~`)) {
    errors.push(`${path.relative(root, detailPath)}: 旧版详情入口必须提供系列材料选择`);
  }
}

const dynamicPaperTemplate = path.join(root, "06-拓展知识库/论文研读/论文/[id].md");
const dynamicPaperPathsFile = path.join(root, "06-拓展知识库/论文研读/论文/[id].paths.mjs");
if (!(await exists(dynamicPaperTemplate)) || !(await exists(dynamicPaperPathsFile))) {
  errors.push("论文详情缺少动态静态路由模板或路径加载器");
} else {
  const templateSource = await readFile(dynamicPaperTemplate, "utf8");
  if (!templateSource.includes("<!-- @content -->")) {
    errors.push("论文详情动态路由模板缺少 @content 注入点");
  }
  const detailPaths = buildPaperDetailPaths();
  if (detailPaths.length !== paperCount) {
    errors.push(`论文详情静态路由数量与论文库不一致：${detailPaths.length} / ${paperCount}`);
  }
  const routeIds = new Set(detailPaths.map((entry) => entry.params?.id));
  if (routeIds.size !== detailPaths.length || detailPaths.some((entry) => !entry.content?.includes(`<PaperDetail spec="`))) {
    errors.push("论文详情静态路由存在重复 ID 或缺少详情组件");
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `内容检查通过：${markdownFiles.length} 篇课程 Markdown（仓库共 ${repositoryMarkdownCount} 篇），` +
  `${mermaidCount} 个 Mermaid 图，${pencilFlowCount} 个二维流程图，${pencilVectorCount} 个向量图，${pencilFormulaPlaneCount} 个公式平面图，` +
  `${pencil3dCount} 个三维铅笔图，${modelRuntimeCount} 个统一运行地图，${tokenComputeTowerCount} 个单 token 计算高楼，${lessonBoardCount} 个章节总览看板，${formulaStoryCount} 个公式关系图，${generationRoadmapCount} 个连续生成路线图，${benchmarkChartCount} 个紧凑单指标榜单表，${benchmarkLeaderboardCount} 个多指标榜单矩阵，${mathBlockCount} 个块级公式，` +
  `${courseLessons.length} 个基础闭环单元，${topicLessons.length} 个专题单元，${learningUnits.length} 个进度单元，${exerciseCount} 道交互题，` +
  `${wikiTerms.length} 个 Wiki 术语，${paperCount} 篇论文/版本记录，打赏原图校验通过。`
);
