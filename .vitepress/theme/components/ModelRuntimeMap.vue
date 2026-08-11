<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import PencilLearningIntent from "./PencilLearningIntent.vue";
import PencilStepExplanation from "./PencilStepExplanation.vue";

type RuntimeKind = "input" | "represent" | "compute" | "choose" | "system";
type RuntimeVisual =
  | "message"
  | "modalities"
  | "sequence"
  | "tensor"
  | "cache"
  | "scores"
  | "selection"
  | "output"
  | "operation"
  | "scalar"
  | "gradient"
  | "parameter-update"
  | "checkpoint"
  | "metrics";
type RuntimeNode = {
  id: string;
  label: string;
  shape: string;
  measureLabel?: string;
  kind: RuntimeKind;
  visual: RuntimeVisual;
  visualMeaning: string;
  owner?: string;
};
type RuntimeEdge = { id: string; from: string; to: string; label?: string };
type RuntimePayload = {
  tokens?: string[];
  ids?: string[];
  positions?: string[];
  values?: string[];
  note?: string;
};
type RuntimeStep = {
  title: string;
  purpose: string;
  detail: string;
  watch: string;
  reflection: string;
  active: string[];
  shape?: string;
  measureLabel?: string;
  payload?: RuntimePayload;
};
type RuntimeMode = {
  id: string;
  label: string;
  overview: string;
  nodes: RuntimeNode[];
  edges: RuntimeEdge[];
  steps: RuntimeStep[];
  rebuild?: string[];
};
type RuntimeSpec = {
  ariaLabel: string;
  learningGoal: string;
  watchFor: string;
  initialMode?: string;
  modes: RuntimeMode[];
  checkpoint?: { title?: string; prompt?: string };
};

const props = defineProps<{ spec: string }>();
const scene = computed<RuntimeSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const modeId = ref(scene.value.initialMode ?? scene.value.modes[0]?.id ?? "");
const viewMode = ref<"motion" | "overview">("overview");
const currentStep = ref(0);
const selectedNodeId = ref("");
const rebuildOpen = ref(false);
const rebuildOrder = ref<string[]>([]);
const rebuildMessage = ref("");
const playing = ref(false);
const reduceMotion = ref(false);
const isFullscreen = ref(false);
const canvasHost = ref<HTMLDivElement | null>(null);
const canvasReady = ref(false);
const canvasError = ref("");

const activeMode = computed(() => scene.value.modes.find((mode) => mode.id === modeId.value) ?? scene.value.modes[0]);
const steps = computed(() => activeMode.value?.steps ?? []);
const stageColumnCount = computed(() => {
  const count = activeMode.value?.nodes.length ?? 1;
  if (count <= 4) return count;
  if (count % 4 === 0) return 4;
  if (count % 3 === 0) return 3;
  return 4;
});
const current = computed(() => steps.value[currentStep.value] ?? steps.value[0]);
const selectedNode = computed(() => activeMode.value?.nodes.find((node) => node.id === selectedNodeId.value) ?? activeMode.value?.nodes[0]);
const activeNodeIds = computed(() => {
  if (viewMode.value === "overview") return new Set(activeMode.value?.nodes.map((node) => node.id) ?? []);
  return new Set(current.value?.active ?? []);
});
const detailStep = computed(() => (viewMode.value === "overview" ? undefined : current.value));
const detailMeasureLabel = computed(() => {
  if (detailStep.value?.shape) return detailStep.value.measureLabel ?? "当前变换";
  return selectedNode.value?.measureLabel ?? "当前形状";
});
const payloadEntries = computed(() => {
  const payload = detailStep.value?.payload;
  if (!payload) return [];
  return [
    payload.tokens ? { label: "token", values: payload.tokens } : null,
    payload.ids ? { label: "ID", values: payload.ids } : null,
    payload.positions ? { label: "位置", values: payload.positions } : null,
    payload.values ? { label: "表示", values: payload.values } : null
  ].filter(Boolean) as Array<{ label: string; values: string[] }>;
});
const rebuildSequence = computed(() => activeMode.value?.rebuild ?? activeMode.value?.nodes.map((node) => node.id) ?? []);
const rebuildCandidates = computed(() => activeMode.value?.nodes ?? []);
const visualLabels: Record<RuntimeVisual, string> = {
  message: "消息条",
  modalities: "模态入口",
  sequence: "离散序列",
  tensor: "数值张量",
  cache: "缓存层栈",
  scores: "候选分数",
  selection: "选择过程",
  output: "输出文本",
  operation: "计算操作",
  scalar: "单个标量",
  gradient: "梯度回传",
  "parameter-update": "参数更新",
  checkpoint: "状态快照",
  metrics: "评测指标"
};
const selectedVisualLabel = computed(() => visualLabels[selectedNode.value?.visual ?? "message"]);
const selectedVisualMeaning = computed(() => selectedNode.value?.visualMeaning ?? "当前图形只表示流程中的一个阶段。");
const activeEdgeLabels = computed(() => {
  if (viewMode.value === "overview") return [];
  const active = new Set(current.value?.active ?? []);
  return (activeMode.value?.edges ?? [])
    .filter((edge) => active.has(edge.id) && edge.label)
    .map((edge) => edge.label as string);
});

let THREE: any;
let threeScene: any;
let camera: any;
let renderer: any;
let resizeObserver: ResizeObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let motionQuery: MediaQueryList | undefined;
let autoStartTimer: ReturnType<typeof setTimeout> | undefined;
let animationFrame = 0;
let playStart = 0;
let dragging = false;
let pointerX = 0;
let pointerY = 0;
let radius = 13.5;
let theta = 1.2;
let phi = 1.03;
const nodeGroups = new Map<string, any>();
const nodePositions = new Map<string, any>();
const visualParts = new Map<string, any[]>();
let flowMarker: any;
let hasAutoStarted = false;
let stageInView = false;
let pausedByVisibility = false;
let destroyed = false;

function decode(value: string) {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function cssColor(name: string, fallback: string) {
  if (!canvasHost.value) return fallback;
  return getComputedStyle(canvasHost.value).getPropertyValue(name).trim() || fallback;
}

function kindColor(kind: RuntimeKind) {
  if (kind === "compute") return cssColor("--pencil-process", "#2873a6");
  if (kind === "choose") return cssColor("--pencil-change", "#a45f06");
  if (kind === "system") return cssColor("--vp-c-brand-1", "#126e63");
  if (kind === "represent") return cssColor("--pencil-input", "#126e63");
  return cssColor("--pencil-muted", "#8a9692");
}

function currentSceneFocus() {
  const target = new THREE.Vector3();
  if (viewMode.value === "overview") return target;

  const focusIds = new Set(activeNodeIds.value);
  if (selectedNodeId.value) focusIds.add(selectedNodeId.value);
  let count = 0;
  for (const id of focusIds) {
    const position = nodePositions.get(id);
    if (!position) continue;
    target.add(position);
    count += 1;
  }
  return count ? target.divideScalar(count) : target;
}

function setCamera() {
  if (!camera) return;
  const target = currentSceneFocus();
  camera.position.set(
    target.x + radius * Math.sin(phi) * Math.cos(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.sin(theta)
  );
  camera.lookAt(target);
}

function lineBetween(from: any, to: any) {
  const start = from.clone().lerp(to, 0.08);
  const end = to.clone().lerp(from, 0.08);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const arrow = new THREE.ArrowHelper(direction.normalize(), start, length, cssColor("--vp-c-brand-1", "#126e63"), 0.16, 0.1);
  arrow.line.material.transparent = true;
  arrow.line.material.opacity = 0.36;
  arrow.cone.material.transparent = true;
  arrow.cone.material.opacity = 0.52;
  return arrow;
}

function disposeScene() {
  if (!threeScene) return;
  threeScene.traverse((object: any) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
  visualParts.clear();
}

function createSampledTensorPoints(color: string) {
  const columns = 6;
  const rows = 5;
  const layers = 3;
  const points: number[] = [];
  for (let layer = 0; layer < layers; layer += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = -0.72 + (column / (columns - 1)) * 1.44;
        const y = -0.38 + (row / (rows - 1)) * 0.76;
        const z = -0.25 + layer * 0.25;
        points.push(x, y, z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.PointsMaterial({ color, size: 3.8, transparent: true, opacity: 0.92, sizeAttenuation: false });
  return new THREE.Points(geometry, material);
}

function createWirePanel(color: string, width = 1.62, height = 0.82, depth = 0.08) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, wireframe: true })
  );
  group.add(mesh);
  return group;
}

function createMessageGlyph(color: string) {
  const group = createWirePanel(color, 1.7, 0.76, 0.06);
  for (let index = 0; index < 3; index += 1) {
    const y = 0.2 - index * 0.2;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.62, y, 0.05),
        new THREE.Vector3(index === 2 ? 0.24 : 0.66, y, 0.05)
      ]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.78 })
    );
    group.add(line);
  }
  return group;
}

function createSequenceGlyph(color: string, count = 4) {
  const group = new THREE.Group();
  const width = 0.34;
  for (let index = 0; index < count; index += 1) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.46, 0.12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, wireframe: true })
    );
    tile.position.x = (index - (count - 1) / 2) * 0.42;
    group.add(tile);
  }
  return group;
}

function createTensorGlyph(color: string) {
  const group = createWirePanel(color);
  group.add(createSampledTensorPoints(color));
  return group;
}

function createCacheGlyph(color: string) {
  const group = new THREE.Group();
  for (let index = 0; index < 3; index += 1) {
    const layer = createTensorGlyph(color);
    layer.position.z = (index - 1) * 0.17;
    layer.position.x = (index - 1) * 0.08;
    group.add(layer);
  }
  return group;
}

function createScoreGlyph(color: string, selected = false) {
  const group = new THREE.Group();
  const heights = [0.24, 0.46, 0.82, 0.38, 0.58];
  for (let index = 0; index < 5; index += 1) {
    const height = heights[index];
    const material = new THREE.MeshBasicMaterial({
      color: selected && index === 2 ? cssColor("--pencil-change", "#a45f06") : color,
      transparent: true,
      opacity: selected && index === 2 ? 0.88 : 0.42
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, 0.1), material);
    bar.position.x = (index - 2) * 0.29;
    bar.position.y = -0.42 + height / 2;
    group.add(bar);
  }
  return group;
}

function createOutputGlyph(color: string) {
  const group = createMessageGlyph(color);
  const cursor = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.18, 0.06),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  cursor.position.set(0.52, -0.2, 0.08);
  group.add(cursor);
  return group;
}

function createOperationGlyph(color: string) {
  const group = new THREE.Group();
  const input = createWirePanel(color, 0.62, 0.58, 0.06);
  input.position.x = -0.52;
  const output = createWirePanel(color, 0.62, 0.58, 0.06);
  output.position.x = 0.52;
  group.add(input, output);
  const line = lineBetween(new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0.18, 0, 0));
  group.add(line);
  return group;
}

function createScalarGlyph(color: string) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.25, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  group.add(ring);
  return group;
}

function createGradientGlyph(color: string) {
  const group = createTensorGlyph(color);
  const arrow = lineBetween(new THREE.Vector3(0.8, 0.58, 0.2), new THREE.Vector3(-0.8, 0.58, 0.2));
  group.add(arrow);
  return group;
}

function createParameterUpdateGlyph(color: string) {
  const group = new THREE.Group();
  const before = createTensorGlyph(color);
  before.position.x = -0.48;
  const after = createTensorGlyph(color);
  after.position.x = 0.48;
  group.add(before, after, lineBetween(new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0)));
  return group;
}

function createCheckpointGlyph(color: string) {
  const group = new THREE.Group();
  for (let index = 0; index < 3; index += 1) {
    const slab = createWirePanel(color, 1.38, 0.62, 0.1);
    slab.position.y = (index - 1) * 0.16;
    slab.position.z = index * 0.08;
    group.add(slab);
  }
  return group;
}

function createMetricsGlyph(color: string) {
  const group = new THREE.Group();
  for (let index = 0; index < 3; index += 1) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.26 + index * 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.56 })
    );
    bar.position.set((index - 1) * 0.34, -0.16 + index * 0.05, 0);
    group.add(bar);
  }
  return group;
}

function createNodeVisual(node: RuntimeNode) {
  const color = kindColor(node.kind);
  if (node.visual === "message") return createMessageGlyph(color);
  if (node.visual === "modalities") return createSequenceGlyph(color, 3);
  if (node.visual === "sequence") return createSequenceGlyph(color, 4);
  if (node.visual === "tensor") return createTensorGlyph(color);
  if (node.visual === "cache") return createCacheGlyph(color);
  if (node.visual === "scores") return createScoreGlyph(color);
  if (node.visual === "selection") return createScoreGlyph(color, true);
  if (node.visual === "output") return createOutputGlyph(color);
  if (node.visual === "operation") return createOperationGlyph(color);
  if (node.visual === "scalar") return createScalarGlyph(color);
  if (node.visual === "gradient") return createGradientGlyph(color);
  if (node.visual === "parameter-update") return createParameterUpdateGlyph(color);
  if (node.visual === "checkpoint") return createCheckpointGlyph(color);
  return createMetricsGlyph(color);
}

function registerVisualParts(nodeId: string, group: any) {
  const parts: any[] = [];
  group.traverse((object: any) => {
    if (object.material) parts.push(object);
  });
  visualParts.set(nodeId, parts);
}

function setVisualOpacity(nodeId: string, factor: number) {
  if (destroyed) return;
  for (const object of visualParts.get(nodeId) ?? []) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || material.userData?.runtimeDisposed) continue;
      material.userData ??= {};
      const baseOpacity = material.userData.runtimeBaseOpacity ?? material.opacity ?? 1;
      material.userData.runtimeBaseOpacity = baseOpacity;
      material.opacity = baseOpacity * factor;
    }
  }
}

function buildScene() {
  if (destroyed || !canvasHost.value || !THREE || !activeMode.value) return;
  stopPath();
  disposeScene();
  renderer?.dispose();
  renderer?.domElement.remove();
  nodeGroups.clear();
  nodePositions.clear();
  visualParts.clear();
  threeScene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.domElement.className = "model-runtime-canvas";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", scene.value.ariaLabel);
  canvasHost.value.prepend(renderer.domElement);

  const nodes = activeMode.value.nodes;
  const spread = Math.min(1.85, 9.5 / Math.max(1, nodes.length - 1));
  const start = -((nodes.length - 1) * spread) / 2;
  nodes.forEach((node, index) => {
    const position = new THREE.Vector3(start + index * spread, (index % 2) * 0.18 - 0.09, ((index % 3) - 1) * 0.55);
    nodePositions.set(node.id, position);
    const group = new THREE.Group();
    const visual = createNodeVisual(node);
    group.add(visual);
    group.position.copy(position);
    group.userData.mesh = visual;
    threeScene.add(group);
    nodeGroups.set(node.id, group);
    registerVisualParts(node.id, group);
  });

  for (const edge of activeMode.value.edges) {
    const from = nodePositions.get(edge.from);
    const to = nodePositions.get(edge.to);
    if (from && to) threeScene.add(lineBetween(from, to));
  }

  flowMarker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.15, 0),
    new THREE.MeshBasicMaterial({ color: cssColor("--pencil-change", "#a45f06"), transparent: true, opacity: 0.9, wireframe: true })
  );
  threeScene.add(flowMarker);
  setCamera();
  resize();
  bindPointerControls();
  canvasReady.value = true;
  updateScene();
}

function resize() {
  if (!canvasHost.value || !renderer || !camera) return;
  const minimumWidth = window.innerWidth <= 560 ? 220 : 280;
  const width = Math.max(minimumWidth, canvasHost.value.clientWidth);
  const height = document.fullscreenElement === canvasHost.value
    ? Math.max(320, window.innerHeight - 42)
    : Math.min(360, Math.max(250, width * 0.46));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderOnce();
}

function renderOnce() {
  if (!destroyed && renderer && threeScene && camera) renderer.render(threeScene, camera);
}

function updateScene() {
  if (destroyed || !renderer || !threeScene) return;
  const visible = activeNodeIds.value;
  for (const node of activeMode.value?.nodes ?? []) {
    const group = nodeGroups.get(node.id);
    const mesh = group?.userData.mesh;
    if (!group || !mesh) continue;
    const active = visible.has(node.id) || viewMode.value === "overview";
    setVisualOpacity(node.id, active ? (node.id === selectedNodeId.value ? 1 : 0.72) : 0.16);
    group.scale.setScalar(node.id === selectedNodeId.value ? 1.18 : active ? 1 : 0.82);
  }
  const first = [...visible].find((id) => nodePositions.has(id));
  const target = nodePositions.get(first ?? activeMode.value?.nodes[0]?.id);
  if (flowMarker && target) flowMarker.position.copy(target).add(new THREE.Vector3(0, 0.6, 0));
  setCamera();
  renderOnce();
}

function bindPointerControls() {
  if (!renderer) return;
  const canvas = renderer.domElement as HTMLCanvasElement;
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    theta -= (event.clientX - pointerX) * 0.008;
    phi = Math.max(0.4, Math.min(1.4, phi + (event.clientY - pointerY) * 0.008));
    pointerX = event.clientX;
    pointerY = event.clientY;
    setCamera();
    renderOnce();
  });
  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (event) => {
    if (window.innerWidth <= 768 || window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    radius = Math.max(7, Math.min(18, radius + event.deltaY * 0.01));
    setCamera();
    renderOnce();
  }, { passive: false });
}

async function toggleFullscreen() {
  if (!canvasHost.value) return;
  syncFullscreenState();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      canvasError.value = "";
      await canvasHost.value.requestFullscreen();
    }
  } catch {
    isFullscreen.value = false;
    canvasError.value = "当前浏览器不支持全屏示意";
  }
}

function syncFullscreenState() {
  isFullscreen.value = document.fullscreenElement === canvasHost.value;
}

function handleFullscreenChange() {
  syncFullscreenState();
  nextTick(resize);
}

function handleFullscreenError() {
  isFullscreen.value = false;
  canvasError.value = "当前浏览器不支持全屏示意";
}

function resetView() {
  radius = 13.5;
  theta = 1.2;
  phi = 1.03;
  setCamera();
  renderOnce();
}

function stopPath() {
  playing.value = false;
  cancelAnimationFrame(animationFrame);
  if (!destroyed && renderer) updateScene();
}

function claimManualControl() {
  hasAutoStarted = true;
  pausedByVisibility = false;
  if (autoStartTimer) clearTimeout(autoStartTimer);
  autoStartTimer = undefined;
}

function scheduleAutoPlay() {
  if (hasAutoStarted || !stageInView || !canvasReady.value || reduceMotion.value || !steps.value.length) return;
  if (autoStartTimer) clearTimeout(autoStartTimer);
  autoStartTimer = setTimeout(() => {
    autoStartTimer = undefined;
    if (!stageInView || hasAutoStarted) return;
    playPath(true);
  }, 620);
}

function playPath(automatic = false) {
  if (!activeMode.value || activeMode.value.nodes.length < 2) return;
  if (reduceMotion.value) return;
  if (!automatic) claimManualControl();
  else if (!hasAutoStarted) hasAutoStarted = true;
  if (playing.value) {
    stopPath();
    return;
  }
  if (currentStep.value >= steps.value.length - 1) {
    currentStep.value = 0;
    selectedNodeId.value = activeMode.value.nodes[0]?.id ?? "";
  }
  viewMode.value = "motion";
  playing.value = true;
  playStart = performance.now();
  const duration = Math.max(steps.value.length * 4200, activeMode.value.nodes.length * 1200);
  const animate = (now: number) => {
    if (!playing.value || !flowMarker) return;
    const progress = Math.min(1, (now - playStart) / duration);
    const nodes = activeMode.value.nodes;
    const scaled = progress * (nodes.length - 1);
    const index = Math.min(nodes.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const fromNode = nodes[index];
    const toNode = nodes[index + 1];
    if (!fromNode || !toNode) {
      stopPath();
      return;
    }
    const from = nodePositions.get(fromNode.id);
    const to = nodePositions.get(toNode.id);
    if (from && to) flowMarker.position.lerpVectors(from, to, local).add(new THREE.Vector3(0, 0.6, 0));
    const focusIndex = Math.min(nodes.length - 1, Math.round(scaled));
    const focusNode = nodes[focusIndex];
    if (focusNode && selectedNodeId.value !== focusNode.id) {
      selectedNodeId.value = focusNode.id;
      const stepIndex = steps.value.findIndex((step) => step.active.includes(focusNode.id));
      if (stepIndex >= 0) currentStep.value = stepIndex;
    }
    for (const [nodeIndex, node] of nodes.entries()) {
      setVisualOpacity(node.id, nodeIndex === focusIndex ? 1 : 0.34);
    }
    renderOnce();
    if (progress >= 1) {
      currentStep.value = Math.max(0, steps.value.length - 1);
      selectedNodeId.value = nodes.at(-1)?.id ?? selectedNodeId.value;
      stopPath();
      return;
    }
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
}

function selectMode(id: string) {
  claimManualControl();
  stopPath();
  const nextMode = scene.value.modes.find((mode) => mode.id === id);
  if (!nextMode) return;
  modeId.value = id;
  currentStep.value = 0;
  selectedNodeId.value = nextMode.nodes[0]?.id ?? "";
  rebuildOrder.value = [];
  rebuildMessage.value = "";
}

function selectStep(index: number) {
  claimManualControl();
  stopPath();
  viewMode.value = "motion";
  currentStep.value = index;
  const focus = steps.value[index]?.active.find((id) => activeMode.value?.nodes.some((node) => node.id === id));
  if (focus) selectedNodeId.value = focus;
  updateScene();
}

function selectNode(id: string) {
  claimManualControl();
  stopPath();
  selectedNodeId.value = id;
  const stepIndex = steps.value.findIndex((step) => step.active.includes(id));
  if (stepIndex >= 0) currentStep.value = stepIndex;
  updateScene();
}

function startRebuild() {
  claimManualControl();
  stopPath();
  rebuildOpen.value = true;
  rebuildOrder.value = [];
  rebuildMessage.value = "先按你记得的顺序点选阶段。";
}

function chooseRebuild(id: string) {
  if (rebuildOrder.value.includes(id)) return;
  const expected = rebuildSequence.value[rebuildOrder.value.length];
  if (id !== expected) {
    rebuildMessage.value = `还没到“${activeMode.value?.nodes.find((node) => node.id === expected)?.label ?? "下一阶段"}”，先回忆它的上游。`;
    return;
  }
  rebuildOrder.value.push(id);
  rebuildMessage.value = rebuildOrder.value.length === rebuildSequence.value.length
    ? "完成：你已经把这条链路重新串起来了。"
    : `已放入 ${rebuildOrder.value.length} / ${rebuildSequence.value.length} 个阶段。`;
}

function closeRebuild() {
  rebuildOpen.value = false;
  rebuildOrder.value = [];
  rebuildMessage.value = "";
}

function setViewMode(mode: "motion" | "overview") {
  claimManualControl();
  stopPath();
  viewMode.value = mode;
}

async function initialize() {
  try {
    THREE = await import("../../vendor/three.module.min.js");
    buildScene();
    resizeObserver = new ResizeObserver(resize);
    if (canvasHost.value) resizeObserver.observe(canvasHost.value);
    scheduleAutoPlay();
  } catch (error) {
    canvasError.value = error instanceof Error ? error.message : "无法初始化三维视图";
  }
}

watch([currentStep, viewMode, selectedNodeId], updateScene);
watch(modeId, () => {
  currentStep.value = Math.min(currentStep.value, Math.max(0, steps.value.length - 1));
  canvasReady.value = false;
  nextTick(() => buildScene());
});

onMounted(() => {
  destroyed = false;
  selectedNodeId.value = activeMode.value?.nodes[0]?.id ?? "";
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduceMotion.value = motionQuery.matches;
  motionQuery.addEventListener("change", handleMotionPreference);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("fullscreenerror", handleFullscreenError);
  intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      stageInView = Boolean(entry?.isIntersecting);
      if (!stageInView) {
        if (autoStartTimer) clearTimeout(autoStartTimer);
        autoStartTimer = undefined;
        if (playing.value) {
          pausedByVisibility = true;
          stopPath();
        }
        return;
      }
      if (pausedByVisibility && currentStep.value < steps.value.length - 1) {
        pausedByVisibility = false;
        playPath(true);
        return;
      }
      scheduleAutoPlay();
    },
    { threshold: 0.3 }
  );
  if (canvasHost.value) intersectionObserver.observe(canvasHost.value);
  void initialize();
});

onBeforeUnmount(() => {
  destroyed = true;
  stopPath();
  if (autoStartTimer) clearTimeout(autoStartTimer);
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  motionQuery?.removeEventListener("change", handleMotionPreference);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  document.removeEventListener("fullscreenerror", handleFullscreenError);
  if (document.fullscreenElement === canvasHost.value) void document.exitFullscreen();
  disposeScene();
  renderer?.dispose();
});

function handleMotionPreference(event: MediaQueryListEvent) {
  reduceMotion.value = event.matches;
  if (event.matches) {
    stopPath();
    viewMode.value = "overview";
  }
}
</script>

<template>
  <figure class="model-runtime-map" :aria-label="scene.ariaLabel">
    <PencilLearningIntent :learning-goal="scene.learningGoal" :watch-for="scene.watchFor" />

    <div class="model-runtime-toolbar" role="group" aria-label="模型运行地图控制">
      <div class="model-runtime-modes" role="group" aria-label="运行阶段">
        <button
          v-for="mode in scene.modes"
          :key="mode.id"
          type="button"
          :aria-pressed="mode.id === modeId"
          @click="selectMode(mode.id)"
        >{{ mode.label }}</button>
      </div>
      <div class="model-runtime-view" role="group" aria-label="地图视图">
        <button type="button" :aria-pressed="viewMode === 'motion'" @click="setViewMode('motion')">逐步</button>
        <button type="button" :aria-pressed="viewMode === 'overview'" @click="setViewMode('overview')">总览</button>
      </div>
      <div class="model-runtime-actions">
        <button type="button" :disabled="reduceMotion" :title="reduceMotion ? '系统已减少动态效果，可直接查看总览' : playing ? '暂停计算' : '播放计算'" @click="playPath()">{{ playing ? "暂停计算" : "播放计算" }}</button>
        <button type="button" @click="resetView">复位视角</button>
        <button type="button" :aria-pressed="isFullscreen" :data-tooltip="isFullscreen ? '退出全屏' : '进入全屏'" @click="toggleFullscreen">{{ isFullscreen ? "退出全屏" : "全屏" }}</button>
        <button type="button" @click="startRebuild">闭卷重建</button>
      </div>
    </div>

    <p class="model-runtime-section-label">阶段索引</p>
    <div class="model-runtime-stage-list" :style="{ '--runtime-stage-columns': stageColumnCount }" role="group" aria-label="模型阶段">
      <button
        v-for="(node, index) in activeMode?.nodes"
        :key="node.id"
        type="button"
        class="model-runtime-stage"
        :class="{ active: activeNodeIds.has(node.id), selected: selectedNodeId === node.id }"
        :aria-current="selectedNodeId === node.id ? 'step' : undefined"
        @click="selectNode(node.id)"
      >
        <span class="model-runtime-stage-index">{{ String(index + 1).padStart(2, "0") }}</span>
        <span class="model-runtime-stage-label">{{ node.label }}</span>
        <code>{{ node.shape }}</code>
        <small class="model-runtime-stage-visual">{{ visualLabels[node.visual] }}</small>
      </button>
    </div>

    <div class="model-runtime-main">
      <div ref="canvasHost" class="model-runtime-space" :title="isFullscreen ? '双击退出全屏' : '双击进入全屏'" @dblclick="toggleFullscreen">
        <button
          v-if="isFullscreen"
          type="button"
          class="model-runtime-exit-fullscreen"
          aria-label="退出全屏"
          @click.stop="toggleFullscreen"
        ><span aria-hidden="true">×</span>退出全屏</button>
        <p v-if="!canvasReady && !canvasError" class="model-runtime-loading">正在建立可旋转的流程舞台...</p>
        <p v-if="canvasError" class="model-runtime-error">流程舞台暂不可用：{{ canvasError }}</p>
        <p class="model-runtime-space-note">移动菱形只表示当前流程焦点，箭头只表示因果传递；节点形状按对象类型区分，同一舞台不表示共享坐标空间。</p>
      </div>

      <section class="model-runtime-detail" aria-live="polite">
        <p class="model-runtime-section-label">当前阶段 · 图形与解释</p>
        <p class="model-runtime-kicker">{{ activeMode?.label }} · {{ viewMode === "overview" ? "全链路" : `第 ${currentStep + 1} / ${steps.length} 步` }}</p>
        <h3>{{ detailStep?.title ?? selectedNode?.label }}</h3>
        <p>{{ detailStep?.watch ?? activeMode?.overview }}</p>
        <p v-if="detailStep?.shape || selectedNode?.shape" class="model-runtime-shape">
          <span>{{ detailMeasureLabel }}</span><code>{{ detailStep?.shape ?? selectedNode?.shape }}</code>
        </p>
        <p v-if="selectedNode?.owner" class="model-runtime-owner"><span>主要负责</span>{{ selectedNode.owner }}</p>
        <p v-if="selectedNode?.visualMeaning" class="model-runtime-visual"><span>{{ selectedVisualLabel }}</span>{{ selectedVisualMeaning }}</p>
        <p v-if="activeEdgeLabels.length" class="model-runtime-action"><span>箭头动作</span>{{ activeEdgeLabels.join("；") }}</p>
        <PencilStepExplanation
          v-if="steps.length"
          :steps="steps"
          :current-step="viewMode === 'overview' ? 0 : currentStep"
          :view-mode="viewMode === 'overview' ? 'static' : 'motion'"
          :overview="activeMode?.overview"
          variant="supplement"
        />
      </section>
    </div>

    <div v-if="payloadEntries.length" class="model-runtime-payload" role="group" aria-label="当前数据形态">
      <div v-for="entry in payloadEntries" :key="entry.label" class="model-runtime-payload-row">
        <strong>{{ entry.label }}</strong>
        <span v-for="(value, index) in entry.values" :key="`${entry.label}-${index}`">{{ value }}</span>
      </div>
      <p v-if="detailStep?.payload?.note">{{ detailStep.payload.note }}</p>
    </div>

    <section v-if="rebuildOpen" class="model-runtime-rebuild" aria-label="闭卷重建">
      <div class="model-runtime-rebuild-heading">
        <div>
          <strong>{{ scene.checkpoint?.title ?? "闭卷重建这条链路" }}</strong>
          <p>{{ scene.checkpoint?.prompt ?? "按正确顺序点选阶段，先回忆关系，再查看完整地图。" }}</p>
        </div>
        <button type="button" @click="closeRebuild">关闭</button>
      </div>
      <div class="model-runtime-rebuild-slots" role="list" aria-label="已重建阶段">
        <span v-for="(id, index) in rebuildSequence" :key="id" role="listitem">
          {{ rebuildOrder[index] ? activeMode?.nodes.find((node) => node.id === rebuildOrder[index])?.label : `第 ${index + 1} 步` }}
        </span>
      </div>
      <div class="model-runtime-rebuild-candidates" role="group" aria-label="选择阶段">
        <button
          v-for="node in rebuildCandidates"
          :key="node.id"
          type="button"
          :disabled="rebuildOrder.includes(node.id)"
          @click="chooseRebuild(node.id)"
        >{{ node.label }}</button>
      </div>
      <p class="model-runtime-rebuild-message" aria-live="polite">{{ rebuildMessage }}</p>
    </section>
  </figure>
</template>

<style scoped>
.model-runtime-map {
  margin: 28px 0;
  padding: 14px 0 6px;
  color: var(--pencil-ink);
}
.model-runtime-toolbar,
.model-runtime-actions,
.model-runtime-modes,
.model-runtime-view {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.model-runtime-toolbar { justify-content: space-between; margin: 0 8px 10px; gap: 9px; }
.model-runtime-toolbar button,
.model-runtime-rebuild button {
  min-height: 32px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 4px 9px;
  color: var(--vp-c-text-1);
  background: transparent;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.model-runtime-toolbar button:hover,
.model-runtime-toolbar button:focus-visible,
.model-runtime-toolbar button[aria-pressed="true"],
.model-runtime-rebuild button:hover,
.model-runtime-rebuild button:focus-visible {
  border-bottom-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 18%, transparent);
}
.model-runtime-section-label {
  margin: 8px 8px 5px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0;
}
.model-runtime-stage-list { display: grid; grid-template-columns: repeat(var(--runtime-stage-columns, 4), minmax(0, 1fr)); gap: 5px; margin: 0 8px 12px; }
.model-runtime-stage {
  display: grid;
  min-width: 0;
  gap: 3px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 7px 6px 8px;
  text-align: left;
  color: var(--vp-c-text-2);
  background: transparent;
  font: inherit;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
}
.model-runtime-stage.active { border-bottom-color: color-mix(in srgb, var(--pencil-process) 54%, transparent); }
.model-runtime-stage.selected { border-bottom-color: var(--vp-c-brand-1); background: color-mix(in srgb, var(--vp-c-brand-soft) 18%, transparent); }
.model-runtime-stage-index { color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); font-size: 11px; }
.model-runtime-stage-label { overflow-wrap: anywhere; color: var(--vp-c-text-1); font-size: 13px; font-weight: 650; line-height: 1.35; }
.model-runtime-stage code { overflow-wrap: anywhere; padding: 0; color: var(--vp-c-text-2); background: transparent; font-size: 10px; }
.model-runtime-stage-visual { overflow-wrap: anywhere; color: var(--vp-c-brand-1); font-size: 10px; line-height: 1.35; }
.model-runtime-main { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr); gap: 16px; align-items: start; }
.model-runtime-space { position: relative; min-width: 0; min-height: 250px; }
.model-runtime-space :deep(.model-runtime-canvas) { display: block; width: 100%; height: auto; min-height: 250px; touch-action: pan-y; }
.model-runtime-space:fullscreen { display: flex; flex-direction: column; min-height: 100vh; border: 0; background: var(--vp-c-bg); }
.model-runtime-space:fullscreen :deep(.model-runtime-canvas) { flex: 1; min-height: 0; }
.model-runtime-space:fullscreen .model-runtime-space-note { flex: 0 0 auto; padding: 9px 18px 14px; text-align: center; }
.model-runtime-exit-fullscreen {
  position: fixed;
  z-index: 4;
  top: max(14px, env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
  display: inline-flex;
  min-height: 42px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 7px 12px;
  align-items: center;
  gap: 6px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  box-shadow: 0 8px 24px rgba(20, 31, 28, 0.18);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.model-runtime-exit-fullscreen:hover,
.model-runtime-exit-fullscreen:focus-visible { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.model-runtime-loading,
.model-runtime-error { position: absolute; inset: 45% 12px auto; margin: 0; color: var(--vp-c-text-2); text-align: center; font-size: 13px; }
.model-runtime-error { color: var(--vp-c-danger-1); }
.model-runtime-space-note { margin: 0; padding: 5px 8px; color: var(--vp-c-text-2); font-size: 11px; line-height: 1.5; }
.model-runtime-detail { min-width: 0; padding: 2px 8px 0 0; }
.model-runtime-detail > .model-runtime-section-label { margin: 0 0 3px; }
.model-runtime-kicker { margin: 0; color: var(--vp-c-brand-1); font-size: 12px; font-weight: 700; }
.model-runtime-detail h3 { margin: 5px 0 7px; color: var(--vp-c-text-1); font-size: 1.05rem; }
.model-runtime-detail > p { margin: 5px 0; color: var(--vp-c-text-2); font-size: 13px; line-height: 1.65; }
.model-runtime-shape,
.model-runtime-owner,
.model-runtime-visual,
.model-runtime-action { display: flex; gap: 7px; align-items: baseline; flex-wrap: wrap; }
.model-runtime-shape span,
.model-runtime-owner span,
.model-runtime-visual span,
.model-runtime-action span { flex: 0 0 auto; color: var(--vp-c-text-2); font-size: 11px; font-weight: 700; }
.model-runtime-shape code { color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); }
.model-runtime-detail :deep(.pencil-step-explanation) { margin: 8px 0 0; border-top: 0; padding: 0; background: transparent; }
.model-runtime-detail :deep(.pencil-step-details) { margin: 7px 0 0; }
.model-runtime-payload { margin: 12px 8px 0; padding-top: 9px; }
.model-runtime-payload-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.model-runtime-payload-row strong { width: 52px; color: var(--vp-c-brand-1); font-size: 12px; }
.model-runtime-payload-row span { border: 1px solid var(--vp-c-divider); border-radius: 3px; padding: 2px 6px; color: var(--vp-c-text-1); background: var(--vp-c-bg); font-family: var(--vp-font-family-mono); font-size: 11px; }
.model-runtime-payload p { margin: 5px 0 0; color: var(--vp-c-text-2); font-size: 11px; }
.model-runtime-rebuild { margin: 14px 8px 0; padding-top: 12px; }
.model-runtime-rebuild-heading { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.model-runtime-rebuild-heading strong { color: var(--vp-c-text-1); font-size: 14px; }
.model-runtime-rebuild-heading p { margin: 3px 0 0; color: var(--vp-c-text-2); font-size: 12px; }
.model-runtime-rebuild-slots,
.model-runtime-rebuild-candidates { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 9px; }
.model-runtime-rebuild-slots span { min-width: 78px; border-bottom: 1px dashed var(--vp-c-divider); padding: 5px 6px; color: var(--vp-c-text-2); font-size: 11px; text-align: center; }
.model-runtime-rebuild-candidates button:disabled { opacity: 0.4; cursor: default; }
.model-runtime-rebuild-message { margin: 8px 0 0; color: var(--vp-c-brand-1); font-size: 12px; }
@media (max-width: 820px) {
  .model-runtime-toolbar { display: grid; grid-template-columns: 1fr auto; }
  .model-runtime-actions { grid-column: 1 / -1; }
  .model-runtime-stage-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .model-runtime-main { grid-template-columns: minmax(0, 1fr); }
  .model-runtime-detail { padding: 0 8px; }
}
@media (max-width: 560px) {
  .model-runtime-map { padding-right: 44px; }
  .model-runtime-toolbar { grid-template-columns: 1fr; }
  .model-runtime-view { justify-content: flex-start; }
  .model-runtime-stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .model-runtime-space { min-height: 245px; }
  .model-runtime-space :deep(.model-runtime-canvas) { min-height: 245px; }
  .model-runtime-rebuild-heading { display: block; }
  .model-runtime-rebuild-heading button { margin-top: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .model-runtime-stage { transition: none; }
}
</style>
