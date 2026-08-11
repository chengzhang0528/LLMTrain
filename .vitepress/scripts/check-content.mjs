import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import DOMPurify from "dompurify";
import mermaid from "mermaid";
import {
  algorithmLessons,
  courseLessons,
  learningUnits,
  legacyLessonAliases,
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
let tokenComputeTowerCount = 0;
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

  for (const fence of fences.filter((item) => ["pencil-flow", "pencil-vector", "pencil-3d", "model-runtime", "token-compute-tower"].includes(item.language))) {
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
  const lessonCode = `D${String(lesson.day).padStart(2, "0")}`;
  const expectedHeading = `# ${lessonCode}：${lesson.title}`;
  if (!source.startsWith(expectedHeading)) {
    errors.push(`${lesson.source}: 页面标题必须与课程清单一致，期望 ${expectedHeading}`);
  }
  if (!source.includes("> **学习导航**：")) {
    errors.push(`${lesson.source}: 缺少承接、本课任务与完成证据组成的学习导航`);
  }

  if (!source.includes("## 本课目标")) {
    errors.push(`${lesson.source}: 缺少可观察的本课目标或完成清单`);
  }
  if (!source.includes("## 为什么要学这一课")) {
    errors.push(`${lesson.source}: 缺少从真实问题解释学习必要性的“为什么要学这一课”`);
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
  ["06-拓展知识库/多模态基础/README.md", "## 先分清模态、编码器和多模态模型"]
];
for (const [relativePath, heading] of foundationalConceptBridges) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  if (!source.includes(heading)) {
    errors.push(`${relativePath}: 缺少基础概念桥接段落 ${heading}`);
  }
}

for (const termName of [
  "language model",
  "large language model",
  "neural network",
  "model architecture",
  "model weights",
  "base model",
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
  "单个 K 或 V 张量可按 (B,Hkv,T,Dh) 理解",
  "得到的是全部缓存的元素估算，不是一个张量的 shape"
]) {
  if (!runtimeLessonSource.includes(marker)) errors.push(`D07 必须区分单张量 shape 与跨层缓存元素估算：${marker}`);
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

for (const alias of legacyLessonAliases) {
  if (!learningSources.has(alias.source)) {
    errors.push(`旧课别名目标不在学习单元中：${alias.oldSource} -> ${alias.source}`);
  }
  if (learningSources.has(alias.oldSource)) {
    errors.push(`旧课别名不能继续作为学习记录主键：${alias.oldSource}`);
  }
  const redirectPath = path.join(root, alias.oldSource);
  if (!(await exists(redirectPath))) {
    errors.push(`旧课地址缺少迁移页：${alias.oldSource}`);
    continue;
  }
  const redirectSource = await readFile(redirectPath, "utf8");
  const targetSlug = alias.href.split("/").at(-1);
  if (!redirectSource.includes(`new URL("./${targetSlug}"`)) {
    errors.push(`旧课迁移页目标错误：${alias.oldSource} -> ${alias.href}`);
  }
  if (!redirectSource.includes("window.location.search") || !redirectSource.includes("window.location.hash")) {
    errors.push(`旧课迁移页必须保留查询参数和锚点：${alias.oldSource}`);
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

  const recallQuestionCount = (sectionSource("看图复述").match(/^\d+\.\s+\S.+$/gm) ?? []).length;
  if (recallQuestionCount < 3) errors.push(`${lesson.source}: 看图复述至少需要 3 个可回答问题`);
  const boundaryItemCount = (sectionSource("方法边界").match(/^-\s+\S.+$/gm) ?? []).length;
  if (boundaryItemCount < 3) errors.push(`${lesson.source}: 方法边界至少需要 3 条具体限制`);

  const diagramCount = extractFences(source, lesson.source)
    .filter((fence) => fence.language === "mermaid").length;
  if (diagramCount < 3) errors.push(`${lesson.source}: 每章至少需要 3 个 Mermaid 图（主图、对照图、生命周期图）`);
  if (/\$\$/.test(source)) errors.push(`${lesson.source}: 算法图解章不得使用块级公式推导`);
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

function collectSidebarLinks(items = []) {
  return items.flatMap((item) => [item.link, ...collectSidebarLinks(item.items)].filter(Boolean));
}

function collectSidebarGroupLinks(groups = []) {
  return groups.flatMap((group) => collectSidebarLinks(group.items));
}

if (Array.isArray(sidebar)) {
  errors.push("课程侧栏必须按路径分区，不能恢复成混合全站内容的单一侧栏");
}

const requiredSidebarScopes = [
  "/",
  "/00-从这里开始/",
  "/01-14天理论课/",
  "/02-第3周实战/",
  "/03-数学急救包/",
  "/04-图解与数字漫画/",
  "/05-速查表/",
  "/06-拓展知识库/",
  "/06-拓展知识库/论文研读/",
  "/06-拓展知识库/论文研读/论文/",
  "/08-支持课程/",
  "/09-模型算法图解/",
  ...topicCourses.map((course) => `${course.base}/`),
  ...seriesPaperCourses.map((course) => `${course.base}/`)
];
for (const scope of requiredSidebarScopes) {
  if (!sidebar[scope]) errors.push(`缺少局部侧栏：${scope}`);
}

const rootSidebarLabels = (sidebar["/"] ?? []).map((group) => group.text);
if (JSON.stringify(rootSidebarLabels) !== JSON.stringify(["课程导航", "按需查阅"])) {
  errors.push(`站点根目录只能提供跨区域入口和按需查阅：${rootSidebarLabels.join(" -> ")}`);
}
if (rootSidebarLabels.some((name) => ["GLM", "Kimi", "DeepSeek", "Qwen"].some((family) => name.includes(family)))) {
  errors.push("具体模型系列不能出现在站点根目录，应归入论文研读的系列局部目录");
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

const startLinks = collectSidebarGroupLinks(sidebar["/00-从这里开始/"]);
if (!startLinks.includes("/00-从这里开始/学习记录与复习")) {
  errors.push("开始区域必须提供学习记录与复习入口");
}

const allSidebarGroups = Object.values(sidebar).flat();
const allSidebarLinks = allSidebarGroups.flatMap((group) => collectSidebarLinks(group.items));
if (allSidebarLinks.some((link) => link.startsWith("/internal/来源与质量审计"))) {
  errors.push("内部质量审计页面不得出现在用户课程侧栏");
}
const internalLearningUnit = learningUnits.find(
  (unit) => unit.source.startsWith("internal/来源与质量审计/") || ["论文速研工作台", "论文证据卡", "审技术报告"].some((label) => unit.title.includes(label))
);
if (internalLearningUnit) {
  errors.push(`内部生产资料不得登记为学习单元：${internalLearningUnit.source}`);
}
const theorySidebar = sidebar["/01-14天理论课/"]?.find((group) => group.text === "理论基础");
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

const paperReadingGroups = sidebar["/06-拓展知识库/论文研读/"] ?? [];
const paperReadingLinks = collectSidebarGroupLinks(paperReadingGroups);
const expectedPaperSections = ["论文导览", "模型系列", "研究问题", "跨系列专题"];
const actualPaperSections = paperReadingGroups.map((group) => group.text);
if (JSON.stringify(actualPaperSections) !== JSON.stringify(expectedPaperSections)) {
  errors.push(`论文研读局部目录没有把导览、模型系列、研究问题和跨系列专题分清：${actualPaperSections.join(" -> ")}`);
}
if (
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/03-如何读懂一篇论文") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/01-论文库") ||
  !paperReadingLinks.includes("/06-拓展知识库/论文研读/02-跨系列问题地图") ||
  seriesPaperCourses.some((course) => !paperReadingLinks.includes(`${course.base}/`))
) {
  errors.push("论文研读入口必须同时提供阅读方法、知识图谱、材料库和各模型系列入口");
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

if (pencilFlowCount < 2 || pencilVectorCount < 1 || pencil3dCount < 1) {
  errors.push(`铅笔视图不足：二维流程 ${pencilFlowCount}，向量 ${pencilVectorCount}，三维 ${pencil3dCount}`);
}

for (const [sourcePath, fence] of [
  ["01-14天理论课/D01-大模型到底是什么.md", "pencil-flow"],
  ["01-14天理论课/D02-文字如何变成数字.md", "pencil-flow"],
  ["01-14天理论课/D03-够用就好的数学基础.md", "pencil-flow"],
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
  `内容检查通过：${markdownFiles.length} 篇 Markdown，` +
  `${mermaidCount} 个 Mermaid 图，${pencilFlowCount} 个二维流程图，${pencilVectorCount} 个向量图，` +
  `${pencil3dCount} 个三维铅笔图，${modelRuntimeCount} 个统一运行地图，${tokenComputeTowerCount} 个单 token 计算高楼，${lessonBoardCount} 个章节总览看板，${mathBlockCount} 个块级公式，` +
  `${courseLessons.length} 个基础闭环单元，${topicLessons.length} 个专题单元，${learningUnits.length} 个进度单元，${exerciseCount} 道交互题，` +
  `${wikiTerms.length} 个 Wiki 术语，${paperCount} 篇论文/版本记录，打赏原图校验通过。`
);
