<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import PencilActionArrow from "./PencilActionArrow.vue";
import PencilLearningIntent from "./PencilLearningIntent.vue";
import PencilStepExplanation from "./PencilStepExplanation.vue";

type TowerStage = "input" | "layers" | "head" | "select";
type MicroscopeStage = "micro-position" | "micro-project" | "micro-score" | "micro-context" | "micro-residual" | "micro-mlp" | "micro-head" | "micro-select";

type TowerProfile = {
  id: string;
  label: string;
  parameters: number;
  blocks: number;
  vocabSize: number;
  bytesPerParameter: number;
  precisionLabel: string;
  pointsPerBlock?: number;
  inputLabel: string;
  outputLabel: string;
};

type TeachingStep = {
  stage: TowerStage | MicroscopeStage;
  title: string;
  pathLabel?: string;
  methodKind?: string;
  method?: string;
  focus?: string;
  purpose: string;
  detail: string;
  watch: string;
  reflection: string;
};

type TowerStep = TeachingStep & { stage: TowerStage };
type MicroscopeStep = TeachingStep & { stage: MicroscopeStage; focus: string };

type MicroscopeSpec = {
  ariaLabel: string;
  result: string;
  boundary: string;
  dimensions: { hidden: number; mlp: number; vocab: number };
  labels: Record<string, string>;
  projections: Array<{ id: "query" | "key" | "value"; symbol: string; weight: string; plain: string }>;
  sequence: Array<{ token: string; role: "cache" | "current"; score: number; attention: number; value: number[] }>;
  vectors: Record<"input" | "context" | "afterAttention" | "mlpDelta" | "output", number[]>;
  vocab: Array<{ token: string; logit: number; selected: boolean }>;
  steps: MicroscopeStep[];
};

type TowerSpec = {
  ariaLabel: string;
  learningGoal: string;
  watchFor: string;
  microscope: MicroscopeSpec;
  profiles: TowerProfile[];
  steps: TowerStep[];
  result: string;
  boundary: string;
};

const props = defineProps<{ spec: string }>();
const scene = computed<TowerSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const profileId = ref(scene.value.profiles[0]?.id ?? "");
const studyView = ref<"micro" | "scale">("micro");
const viewMode = ref<"motion" | "static">("motion");
const currentStep = ref(0);
const playing = ref(false);
const ready = ref(false);
const towerReady = ref(false);
const errorMessage = ref("");
const controlMessage = ref("");
const isFullscreen = ref(false);
const guideOpen = ref(true);
const guideCompleted = ref(false);
const playbackProgress = ref(0);
const guidePosition = ref<{ left: number; top: number } | null>(null);
const fullscreenHost = ref<HTMLElement | null>(null);
const host = ref<HTMLDivElement | null>(null);
const guideCard = ref<HTMLElement | null>(null);

const profile = computed(() => scene.value.profiles.find((item) => item.id === profileId.value) ?? scene.value.profiles[0]);
const microscope = computed(() => scene.value.microscope);
const pointsPerBlock = computed(() => Math.max(16, profile.value?.pointsPerBlock ?? 48));
const visiblePointCount = computed(() => (profile.value?.blocks ?? 0) * pointsPerBlock.value);
const modelScalePerVisiblePoint = computed(() => (profile.value?.parameters ?? 0) / Math.max(1, visiblePointCount.value));
const activeSteps = computed<TeachingStep[]>(() => studyView.value === "micro" ? microscope.value.steps : scene.value.steps);
const activeOverview = computed(() => studyView.value === "micro" ? microscope.value.result : scene.value.result);
const current = computed(() => activeSteps.value[currentStep.value]);
const guidePercent = computed(() => Math.round(Math.min(1, Math.max(0, playbackProgress.value)) * 100));
const guideStatus = computed(() => {
  if (viewMode.value === "static") return "静态总览";
  if (playing.value) return studyView.value === "micro" ? "演示中 · 一层" : "演示中 · 规模";
  if (guideCompleted.value) return "第一轮已完成";
  if (playbackProgress.value > 0) return "已暂停";
  return studyView.value === "micro" ? "先看懂一层" : "再看真实规模";
});
const guideStyle = computed(() => guidePosition.value
  ? { left: `${guidePosition.value.left}px`, top: `${guidePosition.value.top}px`, right: "auto" }
  : undefined);

const microStageOrder: MicroscopeStage[] = ["micro-position", "micro-project", "micro-score", "micro-context", "micro-residual", "micro-mlp", "micro-head", "micro-select"];
const microMatrixCells = Array.from({ length: 32 }, (_, index) => index);
const maxToyLogit = computed(() => Math.max(...microscope.value.vocab.map((item) => item.logit)));
const currentToken = computed(() => microscope.value.sequence.find((item) => item.role === "current"));
const cachedTokens = computed(() => microscope.value.sequence.filter((item) => item.role === "cache"));
const selectedVocab = computed(() => microscope.value.vocab.find((item) => item.selected));
const queryProjection = computed(() => microscope.value.projections.find((item) => item.id === "query"));
const keyProjection = computed(() => microscope.value.projections.find((item) => item.id === "key"));
const valueProjection = computed(() => microscope.value.projections.find((item) => item.id === "value"));

const microMetrics = computed(() => [
  { label: microscope.value.labels.metricScope, value: microscope.value.labels.metricScopeValue },
  { label: microscope.value.labels.metricCurrent, value: `“${currentToken.value?.token ?? ""}”` },
  { label: microscope.value.labels.metricVector, value: `${microscope.value.dimensions.hidden} ${microscope.value.labels.metricVectorUnit}` }
]);

let THREE: any;
let threeScene: any;
let camera: any;
let renderer: any;
let resizeObserver: ResizeObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let guideObserver: IntersectionObserver | undefined;
let themeObserver: MutationObserver | undefined;
let animationFrame = 0;
let autoStartTimer = 0;
let initialized = false;
let destroyed = false;
let stageInView = false;
let autoStarted = false;
let autoSequence = false;
let pausedByVisibility = false;
let dragging = false;
let guideDragPointer: number | null = null;
let guideDragOffsetX = 0;
let guideDragOffsetY = 0;
let pointerX = 0;
let pointerY = 0;
let theta = 0.72;
let radius = 22;
let lookHeight = 0;
let towerHeight = 15;
let floorSpacing = 0.4;
let pulse: any;
let inputToken: any;
let outputToken: any;
let headRing: any;
let headCloud: any;
let selectedCandidate: any;
let selectedCandidateStart: any;
let selectedCandidateEnd: any;
let elevatorLine: any;
let floorClouds: any[] = [];
let floorEdges: any[] = [];
let floorWaves: any[] = [];

function cssColor(name: string, fallback: string) {
  if (!host.value) return fallback;
  return getComputedStyle(host.value).getPropertyValue(name).trim() || fallback;
}

function formatCount(value: number) {
  if (value >= 1e12) return `${Number((value / 1e12).toPrecision(3))}T`;
  if (value >= 1e9) return `${Number((value / 1e9).toPrecision(3))}B`;
  if (value >= 1e6) return `${Number((value / 1e6).toPrecision(3))}M`;
  if (value >= 1e3) return `${Number((value / 1e3).toPrecision(3))}K`;
  return String(Math.round(value));
}

function formatBytes(value: number) {
  if (value >= 1e12) return `${Number((value / 1e12).toPrecision(3))} TB`;
  if (value >= 1e9) return `${Number((value / 1e9).toPrecision(3))} GB`;
  if (value >= 1e6) return `${Number((value / 1e6).toPrecision(3))} MB`;
  return `${Math.round(value)} B`;
}

const metrics = computed(() => {
  const active = profile.value;
  if (!active) return [];
  return [
    { label: "Transformer Blocks", value: String(active.blocks) },
    { label: "模型参数", value: formatCount(active.parameters) },
    { label: "参数主导近似", value: `2P ≈ ${formatCount(active.parameters * 2)} FLOPs / token` },
    { label: `${active.precisionLabel} 全部权重体积`, value: formatBytes(active.parameters * active.bytesPerParameter) },
    { label: "LM Head 候选", value: `${formatCount(active.vocabSize)} logits` },
    { label: "本轮接受", value: "1 token" }
  ];
});

const activeMetrics = computed(() => studyView.value === "micro" ? microMetrics.value : metrics.value);

function formatToyValue(value: number) {
  return value.toFixed(1).replace("-0.0", "0.0");
}

function toyLogitWidth(logit: number) {
  return `${Math.max(8, (logit / Math.max(0.01, maxToyLogit.value)) * 100)}%`;
}

function stageStart(stage: TowerStage | MicroscopeStage) {
  if (stage.startsWith("micro-")) {
    return Math.max(0, microStageOrder.indexOf(stage as MicroscopeStage)) / microscope.value.steps.length;
  }
  if (stage === "layers") return 0.18;
  if (stage === "head") return 0.66;
  if (stage === "select") return 0.84;
  return 0;
}

function cancelAutoStart() {
  if (!autoStartTimer) return;
  window.clearTimeout(autoStartTimer);
  autoStartTimer = 0;
}

function markManualInteraction() {
  autoStarted = true;
  autoSequence = false;
  pausedByVisibility = false;
  cancelAutoStart();
}

function pauseForManualControl() {
  markManualInteraction();
  if (playing.value) stop();
}

function clampGuidePosition() {
  if (!guidePosition.value || !host.value || !guideCard.value) return;
  const stageRect = host.value.getBoundingClientRect();
  const cardRect = guideCard.value.getBoundingClientRect();
  guidePosition.value = {
    left: Math.max(8, Math.min(stageRect.width - cardRect.width - 8, guidePosition.value.left)),
    top: Math.max(8, Math.min(stageRect.height - cardRect.height - 8, guidePosition.value.top))
  };
}

function startGuideDrag(event: PointerEvent) {
  if (event.button !== 0 || !host.value || !guideCard.value) return;
  const stageRect = host.value.getBoundingClientRect();
  const cardRect = guideCard.value.getBoundingClientRect();
  guidePosition.value = { left: cardRect.left - stageRect.left, top: cardRect.top - stageRect.top };
  guideDragPointer = event.pointerId;
  guideDragOffsetX = event.clientX - cardRect.left;
  guideDragOffsetY = event.clientY - cardRect.top;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}

function moveGuide(event: PointerEvent) {
  if (guideDragPointer !== event.pointerId || !host.value || !guideCard.value) return;
  const stageRect = host.value.getBoundingClientRect();
  const cardRect = guideCard.value.getBoundingClientRect();
  guidePosition.value = {
    left: Math.max(8, Math.min(stageRect.width - cardRect.width - 8, event.clientX - stageRect.left - guideDragOffsetX)),
    top: Math.max(8, Math.min(stageRect.height - cardRect.height - 8, event.clientY - stageRect.top - guideDragOffsetY))
  };
}

function endGuideDrag(event: PointerEvent) {
  if (guideDragPointer !== event.pointerId) return;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  guideDragPointer = null;
}

function toggleGuide() {
  guideOpen.value = !guideOpen.value;
  void nextTick(clampGuidePosition);
}

function disposeScene() {
  if (!threeScene) return;
  const geometries = new Set<any>();
  const materials = new Set<any>();
  threeScene.traverse((object: any) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  threeScene.clear();
}

function disposeRenderer() {
  if (!renderer) return;
  renderer.dispose();
  renderer.forceContextLoss?.();
  renderer.domElement.remove();
  renderer = undefined;
}

function line(points: any[], color: string, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function floorPointCloud(floorIndex: number, y: number, total: number) {
  const count = pointsPerBlock.value;
  const columns = Math.max(4, Math.round(Math.sqrt(count * 1.4)));
  const rows = Math.ceil(count / columns);
  const positions: number[] = [];
  const colors: number[] = [];
  const attention = new THREE.Color(cssColor("--pencil-process", "#2873a6"));
  const mlp = new THREE.Color(cssColor("--pencil-change", "#a45f06"));

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = -1.85 + (column / Math.max(1, columns - 1)) * 3.7;
    const z = -1.25 + (row / Math.max(1, rows - 1)) * 2.5;
    const jitter = ((floorIndex * 17 + index * 13) % 11) * 0.006;
    positions.push(x + jitter, y + 0.055, z - jitter);
    const source = column < columns / 2 ? attention : mlp;
    colors.push(source.r, source.g, source.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: total > 48 ? 2.7 : 3.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false
  });
  return new THREE.Points(geometry, material);
}

function buildScene() {
  if (destroyed || !host.value || !THREE || !profile.value) return;
  playing.value = false;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  disposeScene();
  disposeRenderer();
  floorClouds = [];
  floorEdges = [];
  floorWaves = [];

  threeScene = new THREE.Scene();
  const background = new THREE.Color(cssColor("--vp-c-bg-alt", "#f6f7f6"));
  threeScene.background = background;
  threeScene.fog = new THREE.Fog(background, 22, 52);
  camera = new THREE.PerspectiveCamera(31, 1, 0.1, 120);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "token-compute-tower-canvas";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", scene.value.ariaLabel);
  renderer.domElement.tabIndex = 0;
  host.value.prepend(renderer.domElement);

  const blocks = profile.value.blocks;
  floorSpacing = Math.max(0.18, Math.min(0.44, 14.4 / Math.max(1, blocks - 1)));
  towerHeight = Math.max(4, (blocks - 1) * floorSpacing);
  const baseY = -towerHeight / 2;
  const frameColor = cssColor("--pencil-grid", "#cdd4d1");

  const ground = new THREE.GridHelper(18, 18, frameColor, frameColor);
  ground.position.y = baseY - 0.62;
  const groundMaterials = Array.isArray(ground.material) ? ground.material : [ground.material];
  for (const material of groundMaterials) {
    material.transparent = true;
    material.opacity = 0.2;
  }
  threeScene.add(ground);

  for (let index = 0; index < blocks; index += 1) {
    const y = baseY + index * floorSpacing;
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(4.35, Math.max(0.055, floorSpacing * 0.14), 3.2);
    const edges = new THREE.EdgesGeometry(geometry);
    const edge = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: frameColor, transparent: true, opacity: 0.22, depthWrite: false })
    );
    edge.position.y = y;
    const cloud = floorPointCloud(index, y, blocks);
    cloud.userData.baseSize = cloud.material.size;
    const wave = new THREE.Mesh(
      new THREE.PlaneGeometry(4.08, 2.92),
      new THREE.MeshBasicMaterial({
        color: cssColor("--vp-c-brand-1", "#126e63"),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.y = y + 0.035;
    group.add(edge);
    group.add(wave);
    group.add(cloud);
    threeScene.add(group);
    floorEdges.push(edge);
    floorClouds.push(cloud);
    floorWaves.push(wave);
  }

  const elevatorStart = new THREE.Vector3(0, baseY - 0.52, 0);
  const elevatorEnd = new THREE.Vector3(0, baseY + towerHeight + 0.75, 0);
  elevatorLine = line([elevatorStart, elevatorEnd], cssColor("--vp-c-brand-1", "#126e63"), 0.32);
  threeScene.add(elevatorLine);

  inputToken = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.24, 0.56),
    new THREE.MeshBasicMaterial({ color: cssColor("--pencil-input", "#126e63"), transparent: true, opacity: 0.9 })
  );
  inputToken.position.copy(elevatorStart);
  threeScene.add(inputToken);

  pulse = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 14, 9),
    new THREE.MeshBasicMaterial({ color: cssColor("--vp-c-brand-1", "#126e63"), transparent: true, opacity: 0.96 })
  );
  pulse.position.copy(elevatorStart);
  threeScene.add(pulse);

  const headY = baseY + towerHeight + 1.1;
  headRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.15, 0.035, 8, 72),
    new THREE.MeshBasicMaterial({ color: cssColor("--pencil-process", "#2873a6"), transparent: true, opacity: 0.42 })
  );
  headRing.rotation.x = Math.PI / 2;
  headRing.position.y = headY;
  threeScene.add(headRing);

  const headPositions: number[] = [];
  const headColors: number[] = [];
  const headBase = new THREE.Color(cssColor("--pencil-process", "#2873a6"));
  const headSelected = new THREE.Color(cssColor("--pencil-change", "#a45f06"));
  const headPointCount = 120;
  const selectedHeadIndex = 58;
  for (let index = 0; index < headPointCount; index += 1) {
    const angle = (index / headPointCount) * Math.PI * 2;
    const ring = 1.35 + (index % 4) * 0.22;
    const x = Math.cos(angle) * ring;
    const y = ((index % 3) - 1) * 0.07;
    const z = Math.sin(angle) * ring;
    if (index === selectedHeadIndex) {
      selectedCandidateStart = new THREE.Vector3(x, headY + y, z);
      continue;
    }
    headPositions.push(x, y, z);
    headColors.push(headBase.r, headBase.g, headBase.b);
  }
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute("position", new THREE.Float32BufferAttribute(headPositions, 3));
  headGeometry.setAttribute("color", new THREE.Float32BufferAttribute(headColors, 3));
  headCloud = new THREE.Points(
    headGeometry,
    new THREE.PointsMaterial({
      size: 5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    })
  );
  headCloud.position.y = headY;
  threeScene.add(headCloud);

  selectedCandidate = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 10),
    new THREE.MeshBasicMaterial({ color: headBase, transparent: true, opacity: 0.34, depthWrite: false })
  );
  selectedCandidate.userData.baseColor = headBase.clone();
  selectedCandidate.userData.selectedColor = headSelected.clone();
  selectedCandidate.position.copy(selectedCandidateStart);
  threeScene.add(selectedCandidate);

  outputToken = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.28, 0.7),
    new THREE.MeshBasicMaterial({ color: cssColor("--pencil-change", "#a45f06"), transparent: true, opacity: 0.94 })
  );
  outputToken.position.set(-2.75, headY + 0.08, 0);
  selectedCandidateEnd = outputToken.position.clone();
  threeScene.add(outputToken);

  resetView(false);
  resize();
  bindControls();
  updateStage();
  ready.value = true;
  towerReady.value = true;
}

function updateCamera() {
  if (!camera) return;
  const elevation = 0.83;
  camera.position.set(
    radius * Math.cos(theta),
    lookHeight + radius * Math.sin(elevation) * 0.32,
    radius * Math.sin(theta)
  );
  camera.lookAt(0, lookHeight, 0);
}

function resize() {
  if (!host.value || !renderer || !camera) return;
  const width = Math.max(280, host.value.clientWidth);
  const height = document.fullscreenElement === fullscreenHost.value
    ? Math.max(420, window.innerHeight - 250)
    : window.matchMedia("(max-width: 560px)").matches
      ? 460
      : Math.min(610, Math.max(430, width * 0.7));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderOnce();
  void nextTick(clampGuidePosition);
}

function renderOnce() {
  if (renderer && threeScene && camera) renderer.render(threeScene, camera);
}

function stageIndex(stage: TowerStage) {
  return Math.max(0, scene.value.steps.findIndex((step) => step.stage === stage));
}

function updateStage() {
  if (!renderer || !profile.value) return;
  if (playing.value) return;
  const stage = viewMode.value === "static" ? "select" : current.value?.stage ?? "input";
  const baseY = -towerHeight / 2;
  const topY = baseY + towerHeight;
  const inputActive = stage === "input";
  const layersActive = stage === "layers";
  const headActive = stage === "head" || stage === "select";
  const selected = stage === "select";

  const staticOverview = viewMode.value === "static";
  inputToken.material.opacity = inputActive ? 1 : 0.36;
  pulse.visible = viewMode.value === "motion" && (inputActive || layersActive);
  pulse.position.set(0, inputActive ? baseY - 0.52 : layersActive ? baseY + towerHeight * 0.48 : topY + 0.72, 0);
  pulse.material.opacity = layersActive ? 0.68 : 0.9;
  elevatorLine.material.opacity = layersActive ? 0.44 : 0.2;

  floorClouds.forEach((cloud, index) => {
    const focus = Math.round((floorClouds.length - 1) * 0.48);
    const active = layersActive && Math.abs(index - focus) < 1;
    cloud.material.opacity = staticOverview ? 0.66 : active ? 1 : layersActive ? 0.3 : 0.24;
    cloud.material.size = cloud.userData.baseSize * (active ? 2.15 : 1);
  });
  floorEdges.forEach((edge, index) => {
    const focus = Math.round((floorEdges.length - 1) * 0.48);
    edge.material.opacity = staticOverview ? 0.34 : layersActive && Math.abs(index - focus) < 1 ? 0.92 : layersActive ? 0.2 : 0.16;
  });
  floorWaves.forEach((wave, index) => {
    const focus = Math.round((floorWaves.length - 1) * 0.48);
    const active = layersActive && Math.abs(index - focus) < 1;
    wave.material.opacity = staticOverview ? 0.025 : active ? 0.28 : 0;
    wave.scale.setScalar(active ? 1.04 : 0.86);
  });

  headRing.material.opacity = staticOverview ? 0.62 : headActive ? selected ? 0.22 : 0.9 : 0.12;
  headRing.scale.setScalar(headActive || staticOverview ? 1 : 0.72);
  headCloud.material.opacity = staticOverview ? 0.62 : headActive ? selected ? 0.08 : 0.92 : 0.1;
  headCloud.scale.setScalar(headActive || staticOverview ? 1 : 0.18);
  selectedCandidate.visible = true;
  selectedCandidate.material.opacity = staticOverview ? 1 : headActive ? 1 : 0.1;
  selectedCandidate.material.color.copy(
    selected || staticOverview
      ? selectedCandidate.userData.selectedColor
      : selectedCandidate.userData.baseColor
  );
  selectedCandidate.position.copy(selected && !staticOverview ? selectedCandidateEnd : selectedCandidateStart);
  selectedCandidate.scale.setScalar(selected || staticOverview ? 1.75 : 1);
  outputToken.material.opacity = selected || staticOverview ? 1 : 0.12;
  outputToken.scale.setScalar(selected ? 1 : 0.72);
  lookHeight = inputActive ? baseY + 1.7 : layersActive ? 0 : topY - 1.6;
  radius = Math.max(17, towerHeight * 1.28);
  updateCamera();
  renderOnce();
}

function bindControls() {
  if (!renderer) return;
  const canvas = renderer.domElement as HTMLCanvasElement;
  canvas.addEventListener("pointerdown", (event) => {
    pauseForManualControl();
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    theta -= (event.clientX - pointerX) * 0.008;
    lookHeight = Math.max(-towerHeight / 2, Math.min(towerHeight / 2, lookHeight + (event.clientY - pointerY) * 0.012));
    pointerX = event.clientX;
    pointerY = event.clientY;
    updateCamera();
    renderOnce();
  });
  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      pauseForManualControl();
      theta += event.key === "ArrowLeft" ? 0.12 : -0.12;
      event.preventDefault();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      pauseForManualControl();
      lookHeight += event.key === "ArrowUp" ? 0.4 : -0.4;
      lookHeight = Math.max(-towerHeight / 2, Math.min(towerHeight / 2, lookHeight));
      event.preventDefault();
    } else if (event.key === "+" || event.key === "=") {
      pauseForManualControl();
      radius = Math.max(10, radius - 1);
      event.preventDefault();
    } else if (event.key === "-") {
      pauseForManualControl();
      radius = Math.min(44, radius + 1);
      event.preventDefault();
    } else {
      return;
    }
    updateCamera();
    renderOnce();
  });
}

function stop() {
  playing.value = false;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  if (studyView.value === "scale") updateStage();
}

function playMicroscope(automatic = false) {
  if (!automatic) markManualInteraction();
  if (viewMode.value === "static") return;
  if (playing.value) {
    stop();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    viewMode.value = "static";
    currentStep.value = microscope.value.steps.length - 1;
    playbackProgress.value = 1;
    guideCompleted.value = true;
    autoSequence = false;
    return;
  }

  guideOpen.value = true;
  if (guideCompleted.value || playbackProgress.value >= 1) {
    playbackProgress.value = 0;
    currentStep.value = 0;
    guideCompleted.value = false;
  }
  playing.value = true;
  const duration = Math.max(16000, microscope.value.steps.length * 4200);
  const start = performance.now() - playbackProgress.value * duration;
  const animate = (now: number) => {
    if (!playing.value) return;
    const progress = Math.min(1, (now - start) / duration);
    playbackProgress.value = progress;
    currentStep.value = Math.min(
      microscope.value.steps.length - 1,
      Math.floor(progress * microscope.value.steps.length)
    );

    if (progress >= 1) {
      playing.value = false;
      animationFrame = 0;
      if (automatic && autoSequence) {
        autoStartTimer = window.setTimeout(() => {
          autoStartTimer = 0;
          if (destroyed) return;
          studyView.value = "scale";
          currentStep.value = 0;
          playbackProgress.value = 0;
          guideCompleted.value = false;
          void nextTick(() => {
            updateStage();
            if (stageInView) playTower(true);
            else pausedByVisibility = true;
          });
        }, 900);
      } else {
        guideCompleted.value = true;
      }
      return;
    }
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
}

function playTower(automatic = false) {
  if (!automatic) markManualInteraction();
  if (viewMode.value === "static" || !pulse || !profile.value) return;
  if (playing.value) {
    stop();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    viewMode.value = "static";
    currentStep.value = scene.value.steps.length - 1;
    playbackProgress.value = 1;
    guideCompleted.value = true;
    return;
  }

  guideOpen.value = true;
  if (guideCompleted.value || playbackProgress.value >= 1) {
    playbackProgress.value = 0;
    currentStep.value = stageIndex("input");
    guideCompleted.value = false;
  }
  playing.value = true;
  const duration = Math.max(15000, profile.value.blocks * 100);
  const start = performance.now() - playbackProgress.value * duration;
  const baseY = -towerHeight / 2;
  const headY = baseY + towerHeight + 1.1;
  const animate = (now: number) => {
    if (!playing.value) return;
    const progress = Math.min(1, (now - start) / duration);
    playbackProgress.value = progress;
    const climb = Math.min(1, Math.max(0, (progress - 0.18) / 0.48));

    if (progress < 0.18) currentStep.value = stageIndex("input");
    else if (progress < 0.66) currentStep.value = stageIndex("layers");
    else if (progress < 0.84) currentStep.value = stageIndex("head");
    else currentStep.value = stageIndex("select");

    inputToken.material.opacity = progress < 0.18 ? 1 : 0.36;
    pulse.visible = progress < 0.66;
    pulse.position.y = progress < 0.18 ? baseY - 0.52 : progress < 0.66 ? baseY - 0.52 + climb * (towerHeight + 0.55) : headY;
    pulse.scale.setScalar(0.62 + Math.sin(now * 0.012) * 0.1);
    pulse.material.opacity = progress >= 0.18 && progress < 0.66 ? 0.68 : 0.9;
    elevatorLine.material.opacity = progress >= 0.18 && progress < 0.66 ? 0.44 : 0.2;
    const floorPosition = climb * Math.max(0, floorClouds.length - 1);
    floorClouds.forEach((cloud, index) => {
      const activity = progress >= 0.18 && progress < 0.66
        ? clamp01(1 - Math.abs(index - floorPosition) / 1.15)
        : 0;
      cloud.material.opacity = progress < 0.18
        ? 0.18
        : progress < 0.66
          ? 0.2 + activity * 0.8
          : 0.42;
      cloud.material.size = cloud.userData.baseSize * (1 + activity * 1.35);
    });
    floorEdges.forEach((edge, index) => {
      const activity = progress >= 0.18 && progress < 0.66
        ? clamp01(1 - Math.abs(index - floorPosition) / 1.15)
        : 0;
      edge.material.opacity = progress < 0.18
        ? 0.1
        : progress < 0.66
          ? 0.14 + activity * 0.8
          : 0.26;
    });
    floorWaves.forEach((wave, index) => {
      const activity = progress >= 0.18 && progress < 0.66
        ? clamp01(1 - Math.abs(index - floorPosition) / 1.1)
        : 0;
      wave.material.opacity = activity * (0.22 + Math.sin(now * 0.016) * 0.06);
      wave.scale.setScalar(0.78 + activity * 0.32);
    });
    const headProgress = smoothstep((progress - 0.66) / 0.18);
    const selectionProgress = smoothstep((progress - 0.84) / 0.16);
    const candidateScale = 0.18 + headProgress * 0.82;
    headRing.material.opacity = progress < 0.66 ? 0.12 : 0.9 * (1 - selectionProgress * 0.76);
    headRing.scale.setScalar(0.72 + headProgress * 0.28);
    headCloud.material.opacity = progress < 0.66 ? 0.1 : 0.94 * (1 - selectionProgress * 0.92);
    headCloud.scale.setScalar(candidateScale);
    selectedCandidate.visible = progress >= 0.66;
    selectedCandidate.material.opacity = headProgress;
    selectedCandidate.material.color.lerpColors(
      selectedCandidate.userData.baseColor,
      selectedCandidate.userData.selectedColor,
      selectionProgress
    );
    const travelProgress = smoothstep((selectionProgress - 0.34) / 0.66);
    selectedCandidate.position.lerpVectors(selectedCandidateStart, selectedCandidateEnd, travelProgress);
    selectedCandidate.scale.setScalar(1 + selectionProgress * (0.9 + Math.sin(now * 0.012) * 0.12));
    const outputProgress = smoothstep((selectionProgress - 0.72) / 0.28);
    outputToken.material.opacity = 0.1 + outputProgress * 0.9;
    outputToken.scale.setScalar(0.72 + outputProgress * (0.28 + Math.sin(now * 0.009) * 0.06));
    lookHeight = progress < 0.18 ? baseY + 1.7 : progress < 0.66 ? baseY + climb * towerHeight : baseY + towerHeight - 1.6;
    updateCamera();
    renderOnce();

    if (progress >= 1) {
      playing.value = false;
      animationFrame = 0;
      guideCompleted.value = true;
      autoSequence = false;
      updateStage();
      return;
    }
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
}

function play(automatic = false) {
  if (studyView.value === "micro") playMicroscope(automatic);
  else playTower(automatic);
}

function maybeStartAutoGuide() {
  if (autoStarted || !ready.value || !stageInView) return;
  autoStarted = true;
  autoSequence = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    viewMode.value = "static";
    currentStep.value = activeSteps.value.length - 1;
    playbackProgress.value = 1;
    guideCompleted.value = true;
    autoSequence = false;
    return;
  }
  autoStartTimer = window.setTimeout(() => {
    autoStartTimer = 0;
    if (!destroyed && stageInView && !playing.value) play(true);
  }, 700);
}

function previous() {
  pauseForManualControl();
  viewMode.value = "motion";
  currentStep.value = Math.max(0, currentStep.value - 1);
  playbackProgress.value = stageStart(current.value?.stage ?? (studyView.value === "micro" ? "micro-position" : "input"));
  guideCompleted.value = false;
}

function next() {
  pauseForManualControl();
  viewMode.value = "motion";
  currentStep.value = Math.min(activeSteps.value.length - 1, currentStep.value + 1);
  const reachedEnd = currentStep.value === activeSteps.value.length - 1;
  playbackProgress.value = reachedEnd
    ? 1
    : stageStart(current.value?.stage ?? (studyView.value === "micro" ? "micro-position" : "input"));
  guideCompleted.value = reachedEnd;
}

function setStudyView(nextView: "micro" | "scale") {
  pauseForManualControl();
  studyView.value = nextView;
  viewMode.value = "motion";
  currentStep.value = 0;
  playbackProgress.value = 0;
  guideCompleted.value = false;
  if (nextView === "scale") void nextTick(updateStage);
}

function selectProfile(id: string) {
  pauseForManualControl();
  profileId.value = id;
  currentStep.value = 0;
  playbackProgress.value = 0;
  guideCompleted.value = false;
}

function setMode(mode: "motion" | "static") {
  pauseForManualControl();
  viewMode.value = mode;
  if (mode === "static") {
    currentStep.value = activeSteps.value.length - 1;
    playbackProgress.value = 1;
    guideCompleted.value = true;
  } else {
    currentStep.value = 0;
    playbackProgress.value = 0;
    guideCompleted.value = false;
  }
}

function resetView(render = true) {
  if (render) pauseForManualControl();
  theta = 0.72;
  radius = Math.max(17, towerHeight * 1.28);
  lookHeight = 0;
  updateCamera();
  if (render) renderOnce();
}

async function toggleFullscreen() {
  if (!fullscreenHost.value) return;
  controlMessage.value = "";
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await fullscreenHost.value.requestFullscreen();
  } catch {
    controlMessage.value = "当前浏览器不支持全屏显示。";
  }
}

function handleFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === fullscreenHost.value;
  void nextTick(() => {
    resize();
    clampGuidePosition();
  });
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  try {
    THREE = await import("../../vendor/three.module.min.js");
    if (destroyed || !host.value) return;
    buildScene();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host.value);
    themeObserver = new MutationObserver(() => buildScene());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    maybeStartAutoGuide();
  } catch (error) {
    if (destroyed) return;
    errorMessage.value = error instanceof Error ? error.message : "无法初始化单 token 计算高楼";
  }
}

watch([currentStep, viewMode, studyView], () => {
  if (studyView.value === "scale") updateStage();
});
watch(profileId, () => nextTick(buildScene));

onMounted(() => {
  ready.value = true;
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  intersectionObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      void initialize();
      intersectionObserver?.disconnect();
    }
  }, { rootMargin: "180px" });
  if (host.value) intersectionObserver.observe(host.value);

  guideObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    stageInView = entry.isIntersecting && entry.intersectionRatio >= 0.32;
    if (stageInView) {
      if (pausedByVisibility) {
        pausedByVisibility = false;
        cancelAutoStart();
        autoStartTimer = window.setTimeout(() => {
          autoStartTimer = 0;
          if (!destroyed && stageInView && !playing.value && !guideCompleted.value) play(true);
        }, 350);
      } else {
        maybeStartAutoGuide();
      }
    } else if (!entry.isIntersecting && playing.value) {
      pausedByVisibility = true;
      stop();
    }
  }, { threshold: [0, 0.32] });
  if (host.value) guideObserver.observe(host.value);
});

onBeforeUnmount(() => {
  destroyed = true;
  cancelAutoStart();
  stop();
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  guideObserver?.disconnect();
  themeObserver?.disconnect();
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  if (document.fullscreenElement === fullscreenHost.value) void document.exitFullscreen();
  disposeScene();
  disposeRenderer();
});
</script>

<template>
  <figure ref="fullscreenHost" class="token-compute-tower" :aria-label="scene.ariaLabel">
    <button
      v-if="isFullscreen"
      type="button"
      class="token-compute-exit-fullscreen"
      aria-label="退出全屏"
      @click="toggleFullscreen"
    ><span aria-hidden="true">×</span>退出全屏</button>

    <PencilLearningIntent :learning-goal="scene.learningGoal" :watch-for="scene.watchFor" />

    <div class="token-compute-toolbar" aria-label="单 token 计算高楼控制">
      <div class="token-compute-views" role="group" aria-label="观察尺度">
        <button type="button" :aria-pressed="studyView === 'micro'" @click="setStudyView('micro')">看懂一层</button>
        <button type="button" :aria-pressed="studyView === 'scale'" @click="setStudyView('scale')">看真实规模</button>
      </div>
      <div v-if="studyView === 'scale'" class="token-compute-profiles" role="group" aria-label="教学规模">
        <button
          v-for="item in scene.profiles"
          :key="item.id"
          type="button"
          :aria-pressed="item.id === profileId"
          @click="selectProfile(item.id)"
        >{{ item.label }}</button>
      </div>
      <div class="token-compute-modes" role="group" aria-label="显示模式">
        <button type="button" :aria-pressed="viewMode === 'motion'" @click="setMode('motion')">逐步</button>
        <button type="button" :aria-pressed="viewMode === 'static'" @click="setMode('static')">静态总览</button>
      </div>
      <div class="token-compute-actions" role="group" aria-label="播放与视角">
        <button type="button" aria-label="上一步" title="上一步" :disabled="viewMode === 'static' || currentStep === 0" @click="previous">←</button>
        <button class="token-compute-play" type="button" :aria-label="playing ? '暂停一轮计算' : '播放一轮计算'" :title="playing ? '暂停一轮计算' : '播放一轮计算'" :disabled="viewMode === 'static'" @click="play">{{ playing ? "Ⅱ" : "▶" }}</button>
        <button type="button" aria-label="下一步" title="下一步" :disabled="viewMode === 'static' || currentStep >= activeSteps.length - 1" @click="next">→</button>
        <button v-if="studyView === 'scale'" type="button" aria-label="复位视角" title="复位视角" @click="resetView()">↺</button>
        <button type="button" :aria-label="isFullscreen ? '退出全屏' : '进入全屏'" :title="isFullscreen ? '退出全屏' : '进入全屏'" @click="toggleFullscreen">⛶</button>
      </div>
    </div>

    <p v-if="controlMessage" class="token-compute-control-message" role="status">{{ controlMessage }}</p>

    <div class="token-compute-metrics" :class="{ 'token-compute-metrics-micro': studyView === 'micro' }" role="list" :aria-label="studyView === 'micro' ? '算法显微镜玩具规模' : '当前教学规模估算'">
      <div v-for="metric in activeMetrics" :key="metric.label" role="listitem">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
      </div>
    </div>

    <div
      ref="host"
      class="token-compute-stage"
      :class="{ 'token-compute-stage-guide-open': guideOpen, 'token-compute-stage-micro': studyView === 'micro' }"
      :title="isFullscreen ? '双击退出全屏' : '双击进入全屏'"
      @dblclick="toggleFullscreen"
    >
      <div v-if="studyView === 'scale'" class="token-compute-stage-label token-compute-stage-label-input">
        <span>输入</span><strong>{{ profile?.inputLabel }}</strong>
      </div>
      <div v-if="studyView === 'scale'" class="token-compute-stage-label token-compute-stage-label-tower">
        <span>层内并行 / 层间逐层</span><strong>{{ profile?.blocks }} Blocks</strong>
      </div>
      <div v-if="studyView === 'scale'" class="token-compute-stage-label token-compute-stage-label-logits">
        <span>并行得到候选分数</span><strong>{{ formatCount(profile?.vocabSize ?? 0) }} logits</strong>
      </div>
      <div v-if="studyView === 'scale'" class="token-compute-stage-label token-compute-stage-label-output">
        <span>接受</span><strong>{{ profile?.outputLabel }}</strong>
      </div>

      <div
        v-if="studyView === 'micro'"
        class="token-compute-microscope"
        :class="{ 'token-compute-microscope-static': viewMode === 'static' }"
        :aria-label="microscope.ariaLabel"
      >
        <div class="token-compute-micro-scope">
          <strong>{{ microscope.labels.scope }}</strong>
          <span>{{ microscope.labels.scopeBoundary }}</span>
        </div>

        <div v-if="viewMode !== 'static'" class="token-compute-micro-path" role="list" aria-label="一层计算固定路径">
          <div
            v-for="(step, index) in microscope.steps"
            :key="`path-${step.stage}`"
            class="token-compute-micro-path-step"
            :class="{ 'is-current': index === currentStep, 'is-complete': index < currentStep }"
            role="listitem"
          >
            <span>{{ index + 1 }}</span>
            <strong>{{ step.pathLabel }}</strong>
          </div>
        </div>

        <div v-if="viewMode === 'static'" class="token-compute-micro-overview">
          <div v-for="(step, index) in microscope.steps" :key="step.stage">
            <span>{{ index + 1 }}</span>
            <div>
              <strong>{{ step.title }}</strong>
              <small v-if="step.method">{{ step.methodKind }}：{{ step.method }}</small>
            </div>
          </div>
        </div>

        <header v-if="current" class="token-compute-micro-current-step">
          <div class="token-compute-micro-scene-title">
            <span>第 {{ currentStep + 1 }} / {{ activeSteps.length }} 步</span>
            <strong>{{ current.title }}</strong>
          </div>
          <div v-if="current.method" class="token-compute-micro-method">
            <span>{{ current.methodKind }}</span>
            <strong>{{ current.method }}</strong>
          </div>
        </header>

        <div v-if="current?.focus" class="token-compute-micro-focus">
          <span>本步只看</span>
          <strong>{{ current.focus }}</strong>
        </div>

        <Transition v-if="viewMode !== 'static'" name="token-compute-micro-scene" mode="out-in">
          <section v-if="current?.stage === 'micro-position'" key="micro-position" class="token-compute-micro-scene">
            <div class="token-compute-micro-lane token-compute-micro-history-lane">
              <div class="token-compute-micro-lane-label">
                <strong>{{ microscope.labels.historyLane }}</strong>
                <span>{{ microscope.labels.cachePlain }}</span>
                <code>{{ microscope.labels.cacheFormal }}</code>
              </div>
              <div v-for="item in cachedTokens" :key="`cache-${item.token}`" class="token-compute-micro-cache-token">
                <strong>{{ item.token }}</strong>
                <span><code>{{ keyProjection?.symbol }}</code><code>{{ valueProjection?.symbol }}</code></span>
              </div>
            </div>
            <div class="token-compute-micro-lane token-compute-micro-current-lane">
              <div class="token-compute-micro-lane-label">
                <strong>{{ microscope.labels.currentLane }}</strong>
                <span>{{ microscope.labels.currentPlain }}</span>
              </div>
              <div class="token-compute-micro-current-token"><strong>{{ currentToken?.token }}</strong></div>
              <PencilActionArrow :label="microscope.labels.enterAction" />
              <div class="token-compute-micro-state-card">
                <header><strong>{{ microscope.labels.currentState }}</strong><code>{{ microscope.labels.inputSymbol }}</code></header>
                <div class="token-compute-micro-vector" :aria-label="microscope.labels.currentState">
                  <span v-for="(value, index) in microscope.vectors.input" :key="`input-${index}`">{{ formatToyValue(value) }}</span>
                </div>
                <small>{{ microscope.labels.vectorScale }}</small>
              </div>
            </div>
          </section>

          <section v-else-if="current?.stage === 'micro-project'" key="micro-project" class="token-compute-micro-scene">
            <div class="token-compute-micro-project-map">
              <div class="token-compute-micro-state-card token-compute-micro-project-input" :style="{ gridRow: `1 / span ${microscope.projections.length}` }">
                <header><strong>{{ microscope.labels.projectInput }}</strong><code>{{ microscope.labels.inputSymbol }}</code></header>
                <div class="token-compute-micro-vector">
                  <span v-for="(value, index) in microscope.vectors.input" :key="`project-input-${index}`">{{ formatToyValue(value) }}</span>
                </div>
              </div>
              <template v-for="(projection, index) in microscope.projections" :key="projection.id">
                <PencilActionArrow
                  :label="`${projection.weight}：${microscope.labels.projectAction}`"
                  :style="{ gridColumn: '2', gridRow: String(index + 1) }"
                />
                <div class="token-compute-micro-projection-result" :style="{ gridColumn: '3', gridRow: String(index + 1) }">
                  <code>{{ projection.symbol }}</code>
                  <strong>{{ projection.plain }}</strong>
                </div>
              </template>
            </div>
            <p class="token-compute-micro-callout">{{ microscope.labels.appendAction }}</p>
          </section>

          <section v-else-if="current?.stage === 'micro-score'" key="micro-score" class="token-compute-micro-scene">
            <div class="token-compute-micro-score-pipeline">
              <div><code>{{ queryProjection?.symbol }}</code><strong>{{ queryProjection?.plain }}</strong></div>
              <PencilActionArrow :label="microscope.labels.scoreAction" />
              <div><strong>{{ microscope.labels.scoreResult }}</strong></div>
              <PencilActionArrow :label="microscope.labels.normalizeAction" :delay-ms="900" />
              <div><strong>{{ microscope.labels.weightResult }}</strong></div>
            </div>
            <div class="token-compute-micro-score-table">
              <div v-for="item in microscope.sequence" :key="`score-${item.token}`" :class="{ 'is-current': item.role === 'current' }">
                <strong>{{ item.token }}</strong>
                <span><code>{{ microscope.labels.scoreSymbol }} = {{ item.score.toFixed(2) }}</code></span>
                <i><b :style="{ width: `${item.attention * 100}%` }"></b></i>
                <em>{{ Math.round(item.attention * 100) }}%</em>
              </div>
            </div>
          </section>

          <section v-else-if="current?.stage === 'micro-context'" key="micro-context" class="token-compute-micro-scene">
            <div class="token-compute-micro-context-map">
              <div class="token-compute-micro-value-stack">
                <div v-for="item in microscope.sequence" :key="`value-${item.token}`">
                  <strong>{{ item.token }}</strong>
                  <code>{{ Math.round(item.attention * 100) }}% × {{ valueProjection?.symbol }}</code>
                  <div class="token-compute-micro-mini-vector">
                    <span v-for="(value, index) in item.value" :key="`value-${item.token}-${index}`">{{ formatToyValue(value) }}</span>
                  </div>
                </div>
              </div>
              <PencilActionArrow :label="microscope.labels.contextAction" />
              <div class="token-compute-micro-state-card">
                <header><strong>{{ microscope.labels.contextResult }}</strong><code>{{ microscope.labels.contextSymbol }}</code></header>
                <div class="token-compute-micro-vector">
                  <span v-for="(value, index) in microscope.vectors.context" :key="`context-${index}`">{{ formatToyValue(value) }}</span>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="current?.stage === 'micro-residual'" key="micro-residual" class="token-compute-micro-scene">
            <div class="token-compute-micro-equation-flow">
              <div class="token-compute-micro-operands">
                <div class="token-compute-micro-state-card">
                  <header><strong>{{ microscope.labels.residualInput }}</strong><code>{{ microscope.labels.inputSymbol }}</code></header>
                  <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.input" :key="`residual-input-${index}`" :class="{ 'is-focus': index === 0 }">{{ formatToyValue(value) }}</span></div>
                </div>
                <div class="token-compute-micro-state-card">
                  <header><strong>{{ microscope.labels.contextResult }}</strong><code>{{ microscope.labels.contextSymbol }}</code></header>
                  <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.context" :key="`residual-context-${index}`" :class="{ 'is-focus': index === 0 }">{{ formatToyValue(value) }}</span></div>
                </div>
              </div>
              <PencilActionArrow :label="microscope.labels.residualAction" tone="change" />
              <div class="token-compute-micro-state-card token-compute-micro-result-card">
                <header><strong>{{ microscope.labels.residualOutput }}</strong><code>{{ microscope.labels.attentionResidual }}</code></header>
                <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.afterAttention" :key="`residual-output-${index}`" :class="{ 'is-focus': index === 0 }">{{ formatToyValue(value) }}</span></div>
              </div>
            </div>
          </section>

          <section v-else-if="current?.stage === 'micro-mlp'" key="micro-mlp" class="token-compute-micro-scene">
            <div class="token-compute-micro-mlp-flow">
              <div class="token-compute-micro-state-card">
                <header><strong>{{ microscope.labels.mlpInput }}</strong><code>{{ microscope.labels.residualOutputSymbol }}</code></header>
                <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.afterAttention" :key="`mlp-input-${index}`">{{ formatToyValue(value) }}</span></div>
              </div>
              <PencilActionArrow :label="microscope.labels.mlpAction" tone="change" />
              <div class="token-compute-micro-mlp-operator">
                <div class="token-compute-micro-matrix">
                  <i v-for="cell in microMatrixCells" :key="`mlp-cell-${cell}`" :style="{ '--micro-delay': `${(cell % 8) * 0.04}s` }"></i>
                </div>
                <code>{{ microscope.labels.mlpRule }}</code>
              </div>
              <PencilActionArrow :label="microscope.labels.mlpWriteAction" tone="change" :delay-ms="900" />
              <div class="token-compute-micro-state-card">
                <header><strong>{{ microscope.labels.mlpDelta }}</strong><code>{{ microscope.labels.mlpDeltaSymbol }}</code></header>
                <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.mlpDelta" :key="`mlp-delta-${index}`">{{ formatToyValue(value) }}</span></div>
              </div>
            </div>
            <div class="token-compute-micro-mlp-residual">
              <strong>{{ microscope.labels.mlpResidualAction }}</strong>
              <code>{{ microscope.labels.mlpResidual }}</code>
              <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.output" :key="`mlp-output-${index}`">{{ formatToyValue(value) }}</span></div>
            </div>
          </section>

          <section v-else key="micro-head" class="token-compute-micro-scene token-compute-micro-head-scene" :class="{ 'is-selecting': current?.stage === 'micro-select' }">
            <div class="token-compute-micro-head-flow">
              <div class="token-compute-micro-head-input-flow">
                <div class="token-compute-micro-state-card">
                  <header><strong>{{ microscope.labels.blockOutput }}</strong><code>{{ microscope.labels.blockOutputSymbol }}</code></header>
                  <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.output" :key="`head-block-output-${index}`">{{ formatToyValue(value) }}</span></div>
                </div>
                <PencilActionArrow :label="microscope.labels.finalNormAction" direction="down" />
                <div class="token-compute-micro-state-card">
                  <header><strong>{{ microscope.labels.headInput }}</strong><code>{{ microscope.labels.outputSymbol }}</code></header>
                  <div class="token-compute-micro-vector"><span v-for="(value, index) in microscope.vectors.normalized" :key="`head-input-${index}`">{{ formatToyValue(value) }}</span></div>
                </div>
              </div>
              <PencilActionArrow :label="microscope.labels.headAction" />
              <div class="token-compute-micro-vocab" :aria-label="microscope.labels.vocabResult">
                <div
                  v-for="item in microscope.vocab"
                  :key="item.token"
                  :class="{ 'is-selected': item.selected && current?.stage === 'micro-select', 'is-rejected': !item.selected && current?.stage === 'micro-select' }"
                >
                  <span>{{ item.token }}</span>
                  <i><b :style="{ '--micro-logit-width': toyLogitWidth(item.logit) }"></b></i>
                  <em>{{ item.logit.toFixed(1) }}</em>
                </div>
              </div>
            </div>
            <div v-if="current?.stage === 'micro-select'" class="token-compute-micro-select-result">
              <PencilActionArrow :label="microscope.labels.selectionAction" direction="down" tone="change" />
              <strong>{{ microscope.labels.selection }}：“{{ selectedVocab?.token }}”</strong>
            </div>
          </section>
        </Transition>
        <aside v-if="viewMode !== 'static' && current" class="token-compute-micro-caption" aria-live="polite" aria-atomic="true">
          <p><span>为什么</span>{{ current.detail }}</p>
          <p class="token-compute-micro-caption-reflection"><span>停一下想</span>{{ current.reflection }}</p>
        </aside>
      </div>
      <aside
        ref="guideCard"
        class="token-compute-guide"
        :class="{ 'token-compute-guide-collapsed': !guideOpen }"
        :style="guideStyle"
        aria-label="第一轮计算验证指南"
        @dblclick.stop
      >
        <div
          class="token-compute-guide-handle"
          title="拖动验证指南"
          @pointerdown="startGuideDrag"
          @pointermove="moveGuide"
          @pointerup="endGuideDrag"
          @pointercancel="endGuideDrag"
        >
          <span class="token-compute-guide-grip" aria-hidden="true">⋮⋮</span>
          <span class="token-compute-guide-heading">
            <small>{{ guideStatus }}</small>
            <strong>第一轮验证</strong>
          </span>
          <span class="token-compute-guide-step">{{ viewMode === "static" ? activeSteps.length : currentStep + 1 }} / {{ activeSteps.length }}</span>
          <button
            type="button"
            :aria-label="guideOpen ? '收起验证指南' : '展开验证指南'"
            :title="guideOpen ? '收起验证指南' : '展开验证指南'"
            @pointerdown.stop
            @click="toggleGuide"
          >{{ guideOpen ? "−" : "+" }}</button>
        </div>
        <div v-if="guideOpen" class="token-compute-guide-body">
          <div
            class="token-compute-guide-progress"
            role="progressbar"
            aria-label="第一轮验证进度"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="guidePercent"
          ><i :style="{ width: `${guidePercent}%` }"></i></div>
          <div class="token-compute-guide-status">{{ guidePercent }}% · {{ guideStatus }}</div>
        </div>
      </aside>
      <p v-if="studyView === 'scale' && !towerReady && !errorMessage" class="token-compute-loading">正在建立参数高楼...</p>
      <p v-if="studyView === 'scale' && errorMessage" class="token-compute-error">三维示意暂不可用：{{ errorMessage }}</p>
    </div>

    <PencilStepExplanation
      v-if="studyView === 'scale' || viewMode === 'static'"
      :steps="activeSteps"
      :current-step="currentStep"
      :view-mode="viewMode"
      :overview="activeOverview"
    />

    <div v-if="studyView === 'scale'" class="token-compute-scale-note">
      <span>可见点 {{ visiblePointCount.toLocaleString("zh-CN") }} 个，仅抽样层内结构</span>
      <span class="token-compute-key"><i class="token-compute-swatch token-compute-swatch-attention" aria-hidden="true"></i>Attention 参数抽样</span>
      <span class="token-compute-key"><i class="token-compute-swatch token-compute-swatch-mlp" aria-hidden="true"></i>MLP 参数抽样</span>
      <span class="token-compute-key"><i class="token-compute-wave-key" aria-hidden="true"></i>层内并行计算波前</span>
      <span class="token-compute-key"><i class="token-compute-line-key" aria-hidden="true"></i>残差信息通路</span>
      <strong>全模型参数量 / 可见点数：约 {{ formatCount(modelScalePerVisiblePoint) }}（仅作数量级对照）</strong>
      <span>{{ scene.boundary }}</span>
    </div>
    <div v-else class="token-compute-scale-note token-compute-micro-note">
      <strong>玩具规模：{{ microscope.dimensions.hidden }} 维隐藏向量 → {{ microscope.dimensions.mlp }} 维 MLP → {{ microscope.dimensions.vocab }} 个 logits</strong>
      <span>{{ microscope.boundary }}</span>
    </div>

  </figure>
</template>

<style scoped>
.token-compute-tower {
  width: min(870px, calc(100vw - 540px));
  margin: 32px 50% 34px;
  padding: 15px 0 8px;
  transform: translateX(-50%);
  color: var(--vp-c-text-1);
}
.token-compute-tower:fullscreen {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  overflow: auto;
  padding: 13px 16px 270px;
  transform: none;
  background: var(--vp-c-bg);
}
.token-compute-exit-fullscreen {
  position: fixed;
  z-index: 20;
  top: 14px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  border: 2px solid #fff;
  border-radius: 4px;
  padding: 8px 14px;
  color: #fff;
  background: var(--vp-c-danger-1);
  box-shadow: 0 3px 14px rgb(0 0 0 / 28%);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.token-compute-exit-fullscreen span {
  font-size: 22px;
  line-height: 1;
}
.token-compute-exit-fullscreen:hover,
.token-compute-exit-fullscreen:focus-visible {
  outline: 3px solid var(--vp-c-bg);
  outline-offset: 2px;
}
.token-compute-tower:fullscreen .token-compute-toolbar {
  position: sticky;
  z-index: 5;
  top: 0;
  padding: 8px 144px 8px 0;
  background: var(--vp-c-bg);
}
.token-compute-toolbar,
.token-compute-views,
.token-compute-profiles,
.token-compute-modes,
.token-compute-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.token-compute-toolbar {
  justify-content: space-between;
  gap: 9px;
  margin: 0 8px 10px;
}
.token-compute-toolbar button {
  min-height: 34px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 4px 10px;
  color: var(--vp-c-text-1);
  background: transparent;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.token-compute-actions button {
  width: 36px;
  padding-inline: 0;
  font-family: var(--vp-font-family-mono);
}
.token-compute-toolbar button:hover,
.token-compute-toolbar button:focus-visible,
.token-compute-toolbar button[aria-pressed="true"] {
  border-bottom-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 18%, transparent);
}
.token-compute-toolbar button:disabled {
  opacity: 0.38;
  cursor: default;
}
.token-compute-control-message {
  margin: -3px 8px 9px;
  color: var(--vp-c-danger-1);
  font-size: 12px;
}
.token-compute-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px 18px;
  margin: 0 8px 8px;
  background: transparent;
}
.token-compute-metrics-micro { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.token-compute-metrics > div {
  display: grid;
  min-width: 0;
  min-height: 52px;
  align-content: center;
  gap: 3px;
  padding: 6px 2px;
  background: transparent;
}
.token-compute-metrics span {
  overflow-wrap: anywhere;
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.35;
}
.token-compute-metrics strong {
  overflow-wrap: anywhere;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.35;
}
.token-compute-stage {
  position: relative;
  min-width: 0;
  min-height: 430px;
  overflow: hidden;
  background: transparent;
}
.token-compute-stage-micro {
  min-height: 0;
  overflow: visible;
}
.token-compute-stage :deep(.token-compute-tower-canvas) {
  display: block;
  width: 100%;
  min-height: 430px;
  touch-action: pan-y;
}
.token-compute-microscope {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: grid;
  align-content: start;
  gap: 10px;
  overflow: auto;
  padding: 128px 86px 20px 14px;
  letter-spacing: 0;
  background: transparent;
}
.token-compute-stage-micro .token-compute-microscope {
  position: relative;
  inset: auto;
  overflow: visible;
}
.token-compute-stage-micro :deep(.token-compute-tower-canvas) { display: none !important; }
.token-compute-micro-scope {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
  padding-bottom: 7px;
}
.token-compute-micro-scope strong {
  color: var(--pencil-input);
  font-size: 11px;
  line-height: 1.35;
}
.token-compute-micro-scope span {
  color: var(--vp-c-text-2);
  font-size: 10px;
  line-height: 1.45;
  text-align: right;
}
.token-compute-micro-path {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 3px;
}
.token-compute-micro-path-step {
  display: grid;
  min-width: 0;
  min-height: 32px;
  align-content: center;
  gap: 2px;
  border-top: 2px solid var(--vp-c-divider);
  padding: 4px 5px;
  color: var(--vp-c-text-3);
  background: transparent;
}
.token-compute-micro-path-step span {
  color: inherit;
  font-family: var(--vp-font-family-mono);
  font-size: 9px;
  line-height: 1;
}
.token-compute-micro-path-step strong {
  overflow-wrap: anywhere;
  color: inherit;
  font-size: 10px;
  line-height: 1.2;
}
.token-compute-micro-path-step.is-complete {
  border-top-color: color-mix(in srgb, var(--vp-c-brand-1) 52%, var(--vp-c-divider));
  color: var(--vp-c-text-2);
}
.token-compute-micro-path-step.is-current {
  border-top: 3px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 16%, transparent);
}
.token-compute-micro-scene {
  display: grid;
  min-width: 0;
  min-height: 0;
  align-content: start;
  gap: 12px;
  border-left: 3px solid var(--vp-c-brand-1);
  padding: 9px 10px 12px;
  background: transparent;
}
.token-compute-micro-current-step {
  display: grid;
  gap: 7px;
}
.token-compute-stage-micro .token-compute-micro-current-step,
.token-compute-stage-micro .token-compute-micro-focus,
.token-compute-stage-micro .token-compute-micro-scene,
.token-compute-stage-micro .token-compute-micro-caption {
  width: min(100%, 1180px);
  margin-inline: auto;
}
.token-compute-micro-scene-title {
  padding-bottom: 7px;
}
.token-compute-micro-scene-title span {
  display: block;
  margin-bottom: 3px;
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  font-weight: 700;
}
.token-compute-micro-scene-title strong {
  font-size: 13px;
  line-height: 1.35;
}
.token-compute-micro-method {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px 8px;
  border-left: 3px solid var(--pencil-process);
  padding: 6px 9px;
  background: transparent;
}
.token-compute-micro-method span {
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 700;
}
.token-compute-micro-method strong {
  color: var(--pencil-process);
  font-size: 12px;
  line-height: 1.4;
}
.token-compute-micro-caption {
  display: grid;
  gap: 6px;
  border-left: 3px solid var(--pencil-change);
  padding: 10px 12px;
  background: transparent;
}
.token-compute-micro-caption-heading {
  display: grid;
  gap: 2px;
}
.token-compute-micro-caption-heading span,
.token-compute-micro-caption p span {
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 700;
}
.token-compute-micro-caption-heading strong {
  color: var(--vp-c-text-1);
  font-size: 13px;
  line-height: 1.45;
}
.token-compute-micro-caption p {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 11px;
  line-height: 1.5;
}
.token-compute-micro-caption p span {
  display: inline-block;
  min-width: 54px;
  margin-right: 7px;
  color: var(--pencil-process);
}
.token-compute-micro-caption-reflection {
  padding-top: 6px;
  color: var(--vp-c-warning-1) !important;
}
.token-compute-micro-caption-reflection span { color: var(--vp-c-warning-1) !important; }
.token-compute-micro-scene code,
.token-compute-micro-overview code {
  padding: 0;
  color: inherit;
  background: transparent;
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
}
.token-compute-micro-scene-enter-active,
.token-compute-micro-scene-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.token-compute-micro-scene-enter-from { opacity: 0; transform: translateY(8px); }
.token-compute-micro-scene-leave-to { opacity: 0; transform: translateY(-5px); }
.token-compute-micro-overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.token-compute-micro-overview > div {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  min-height: 54px;
  border-left: 2px solid var(--vp-c-brand-1);
  padding: 7px 9px;
  background: transparent;
}
.token-compute-micro-overview span {
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}
.token-compute-micro-overview strong { font-size: 11px; line-height: 1.4; }
.token-compute-micro-lane {
  display: grid;
  align-items: center;
  gap: 8px;
  border: 0;
  border-left: 2px solid color-mix(in srgb, var(--pencil-process) 48%, transparent);
  padding: 9px;
  background: transparent;
}
.token-compute-micro-history-lane {
  grid-template-columns: minmax(180px, 1.5fr) repeat(3, minmax(76px, 1fr));
}
.token-compute-micro-current-lane {
  grid-template-columns: minmax(160px, 1fr) minmax(62px, 0.55fr) minmax(110px, 0.9fr) minmax(230px, 2fr);
}
.token-compute-micro-lane-label {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.token-compute-micro-lane-label strong { font-size: 11px; line-height: 1.3; }
.token-compute-micro-lane-label span {
  color: var(--vp-c-text-2);
  font-size: 9px;
  line-height: 1.35;
}
.token-compute-micro-lane-label code { color: var(--pencil-process); }
.token-compute-micro-cache-token,
.token-compute-micro-current-token {
  display: grid;
  min-height: 54px;
  place-items: center;
  gap: 4px;
  border-left: 3px solid var(--pencil-process);
  background: color-mix(in srgb, var(--pencil-process) 8%, var(--vp-c-bg-alt));
}
.token-compute-micro-cache-token strong,
.token-compute-micro-current-token strong { font-size: 13px; }
.token-compute-micro-cache-token span { display: flex; gap: 5px; }
.token-compute-micro-cache-token code {
  border: 1px solid color-mix(in srgb, var(--pencil-process) 45%, var(--vp-c-divider));
  padding: 1px 5px;
}
.token-compute-micro-current-token {
  border-color: var(--pencil-input);
  background: color-mix(in srgb, var(--pencil-input) 10%, var(--vp-c-bg-alt));
}
.token-compute-micro-state-card {
  display: grid;
  min-width: 0;
  gap: 6px;
  border: 0;
  border-left: 2px solid color-mix(in srgb, var(--pencil-input) 58%, transparent);
  padding: 8px;
  background: transparent;
}
.token-compute-micro-state-card header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.token-compute-micro-state-card header strong { font-size: 10px; line-height: 1.3; }
.token-compute-micro-state-card header code { color: var(--pencil-input); font-weight: 700; }
.token-compute-micro-state-card small {
  color: var(--vp-c-text-2);
  font-size: 8px;
  line-height: 1.3;
}
.token-compute-micro-vector {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-self: start;
  gap: 2px;
  border: 1px solid color-mix(in srgb, var(--pencil-input) 34%, var(--vp-c-divider));
  padding: 4px 7px;
  color: var(--vp-c-text-1);
  background: color-mix(in srgb, var(--pencil-input) 5%, transparent);
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  line-height: 1.25;
  white-space: nowrap;
}
.token-compute-micro-vector::before,
.token-compute-micro-vector::after {
  color: var(--pencil-input);
  font-size: 13px;
  line-height: 1;
}
.token-compute-micro-vector::before { content: "["; }
.token-compute-micro-vector::after { content: "]"; }
.token-compute-micro-vector span {
  display: inline-block;
  min-width: 3.4ch;
  min-height: 0;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  line-height: inherit;
  text-align: right;
}
.token-compute-micro-vector span:not(:last-child)::after {
  content: ",";
  margin-left: 1px;
  color: var(--vp-c-text-3);
}
.token-compute-micro-vector span.is-focus {
  border-bottom: 2px solid var(--pencil-change);
  color: var(--pencil-change);
  font-weight: 700;
}
.token-compute-actions .token-compute-play {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.token-compute-micro-focus {
  display: flex;
  align-items: baseline;
  gap: 7px;
  border-left: 3px solid var(--pencil-change);
  padding: 6px 9px;
  background: transparent;
}
.token-compute-micro-focus span {
  flex: 0 0 auto;
  color: var(--pencil-change);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.token-compute-micro-focus strong {
  min-width: 0;
  color: var(--vp-c-text-1);
  font-size: 12px;
  line-height: 1.45;
}
.token-compute-micro-project-map {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(150px, 1fr) minmax(180px, 1.15fr);
  align-items: center;
  gap: 8px 14px;
}
.token-compute-micro-project-input { align-self: stretch; align-content: center; }
.token-compute-micro-projection-result {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  min-height: 60px;
  border-left: 3px solid var(--pencil-process);
  padding: 7px 9px;
  background: transparent;
}
.token-compute-micro-projection-result code {
  color: var(--pencil-process);
  font-size: 16px;
  font-weight: 700;
}
.token-compute-micro-projection-result strong { font-size: 10px; line-height: 1.35; }
.token-compute-micro-callout {
  margin: 0;
  border-left: 3px solid var(--pencil-process);
  padding: 6px 9px;
  color: var(--vp-c-text-2);
  background: transparent;
  font-size: 10px;
  line-height: 1.4;
}
.token-compute-micro-score-pipeline {
  display: grid;
  grid-template-columns: minmax(70px, 0.8fr) minmax(90px, 1fr) minmax(70px, 0.8fr) minmax(110px, 1.2fr) minmax(80px, 0.85fr);
  align-items: center;
  gap: 10px;
}
.token-compute-micro-score-pipeline > div {
  display: grid;
  min-height: 54px;
  place-items: center;
  border-left: 3px solid var(--pencil-process);
  padding: 6px;
  background: transparent;
  text-align: center;
}
.token-compute-micro-score-pipeline code { color: var(--pencil-process); font-size: 15px; font-weight: 700; }
.token-compute-micro-score-pipeline strong { font-size: 9px; line-height: 1.3; }
.token-compute-micro-score-table {
  display: grid;
  gap: 4px;
}
.token-compute-micro-score-table > div {
  display: grid;
  grid-template-columns: minmax(62px, 0.55fr) minmax(88px, 0.75fr) minmax(120px, 2fr) 42px;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  border-left: 3px solid var(--pencil-process);
  padding: 4px 8px;
  background: transparent;
  font-size: 10px;
}
.token-compute-micro-score-table > div.is-current {
  border-color: var(--pencil-input);
  background: color-mix(in srgb, var(--pencil-input) 12%, transparent);
}
.token-compute-micro-score-table i,
.token-compute-micro-vocab i {
  height: 7px;
  overflow: hidden;
  background: var(--vp-c-divider);
}
.token-compute-micro-score-table b,
.token-compute-micro-vocab b {
  display: block;
  height: 100%;
  background: var(--pencil-process);
  transform-origin: left center;
  animation: token-compute-bar-grow 520ms ease-out both;
}
.token-compute-micro-score-table em,
.token-compute-micro-vocab em {
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  font-style: normal;
  text-align: right;
}
.token-compute-micro-context-map,
.token-compute-micro-equation-flow {
  display: grid;
  grid-template-columns: minmax(180px, 1.3fr) minmax(120px, 1fr) minmax(180px, 1.3fr);
  align-items: center;
  gap: 14px;
}
.token-compute-micro-value-stack,
.token-compute-micro-operands {
  display: grid;
  gap: 5px;
}
.token-compute-micro-value-stack > div {
  display: grid;
  grid-template-columns: minmax(42px, 0.55fr) auto minmax(120px, 1.8fr);
  align-items: center;
  min-height: 42px;
  border-left: 3px solid var(--pencil-process);
  padding: 5px 8px;
  background: transparent;
}
.token-compute-micro-value-stack strong { font-size: 11px; }
.token-compute-micro-value-stack code { color: var(--pencil-process); }
.token-compute-micro-mini-vector {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 1px;
  border: 1px solid color-mix(in srgb, var(--pencil-process) 32%, var(--vp-c-divider));
  padding: 2px 4px;
  background: color-mix(in srgb, var(--pencil-process) 5%, transparent);
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
  line-height: 1.2;
  white-space: nowrap;
}
.token-compute-micro-mini-vector::before,
.token-compute-micro-mini-vector::after {
  color: var(--pencil-process);
  font-size: 10px;
  line-height: 1;
}
.token-compute-micro-mini-vector::before { content: "["; }
.token-compute-micro-mini-vector::after { content: "]"; }
.token-compute-micro-mini-vector span {
  display: inline-block;
  min-width: 2.8ch;
  color: var(--vp-c-text-1);
  text-align: right;
}
.token-compute-micro-mini-vector span:not(:last-child)::after {
  content: ",";
  margin-left: 1px;
  color: var(--vp-c-text-3);
}
.token-compute-micro-result-card { border-left-color: color-mix(in srgb, var(--pencil-change) 62%, transparent); }
.token-compute-micro-mlp-flow {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(115px, 0.9fr) auto minmax(105px, 0.8fr) minmax(140px, 1fr);
  align-items: center;
  gap: 10px;
}
.token-compute-micro-mlp-operator {
  display: grid;
  place-items: center;
  gap: 7px;
  border: 0;
  padding: 9px;
  background: transparent;
}
.token-compute-micro-matrix {
  display: grid;
  grid-template-columns: repeat(8, 7px);
  gap: 3px;
}
.token-compute-micro-matrix i {
  width: 7px;
  height: 7px;
  background: color-mix(in srgb, var(--pencil-change) 50%, var(--vp-c-divider));
  animation: token-compute-matrix-pulse 720ms ease-in-out var(--micro-delay) infinite alternate;
}
.token-compute-micro-mlp-residual {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(220px, 1.2fr);
  align-items: center;
  gap: 10px;
  border-left: 3px solid var(--pencil-change);
  padding: 7px 9px;
  background: transparent;
}
.token-compute-micro-mlp-residual strong { font-size: 10px; }
.token-compute-micro-mlp-residual code { color: var(--pencil-change); }
.token-compute-micro-project-map,
.token-compute-micro-score-pipeline,
.token-compute-micro-context-map,
.token-compute-micro-equation-flow,
.token-compute-micro-mlp-flow,
.token-compute-micro-head-flow {
  width: min(100%, 1040px);
  margin-inline: auto;
}
.token-compute-micro-head-flow {
  display: grid;
  grid-template-columns: minmax(190px, 220px) minmax(160px, 180px) minmax(360px, 460px);
  justify-content: center;
  align-items: center;
  gap: 10px;
}
.token-compute-micro-head-input-flow {
  display: grid;
  gap: 5px;
}
.token-compute-micro-head-input-flow :deep(.pencil-action-arrow) {
  width: 100%;
}
.token-compute-micro-vocab {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}
.token-compute-micro-vocab > div {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 34px;
  font-size: 10px;
  transition: opacity 220ms ease;
}
.token-compute-micro-vocab b {
  width: var(--micro-logit-width);
  transition: background-color 220ms ease;
}
.token-compute-micro-vocab > div.is-rejected { opacity: 0.2; }
.token-compute-micro-vocab > div.is-selected { color: var(--pencil-change); font-weight: 700; }
.token-compute-micro-vocab > div.is-selected b { background: var(--pencil-change); }
.token-compute-micro-select-result {
  display: grid;
  justify-items: center;
  gap: 3px;
}
.token-compute-micro-select-result :deep(.pencil-action-arrow) { width: min(360px, 80%); }
.token-compute-micro-select-result strong {
  border-bottom: 3px solid var(--pencil-change);
  padding: 4px 12px 6px;
  color: var(--pencil-change);
  font-size: 14px;
  line-height: 1.3;
}
.token-compute-micro-note strong { color: var(--pencil-input); }
@media (min-width: 700px) {
  .token-compute-stage-micro .token-compute-microscope { padding-top: 12px; }
  .token-compute-stage-micro .token-compute-micro-scope,
  .token-compute-stage-micro .token-compute-micro-path {
    margin-right: min(356px, 54%);
  }
}
@keyframes token-compute-matrix-pulse {
  from { opacity: 0.34; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1.16); }
}
@keyframes token-compute-bar-grow {
  from { transform: scaleX(0.04); }
  to { transform: scaleX(1); }
}
.token-compute-guide {
  position: absolute;
  z-index: 4;
  top: 14px;
  right: 14px;
  width: min(300px, calc(100% - 28px));
  border: 0;
  border-left: 2px solid var(--vp-c-brand-1);
  border-radius: 0;
  color: var(--vp-c-text-1);
  background: transparent;
  box-shadow: none;
  text-shadow: 0 1px 2px var(--vp-c-bg), 0 0 8px var(--vp-c-bg);
}
.token-compute-guide-collapsed { width: min(230px, calc(100% - 28px)); }
.token-compute-stage-micro .token-compute-guide {
  top: 10px;
  right: 10px;
  width: min(340px, calc(100% - 20px));
}
.token-compute-stage-micro .token-compute-guide-collapsed { width: min(230px, calc(100% - 20px)); }
.token-compute-guide-handle {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
  min-height: 48px;
  padding: 6px 7px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.token-compute-guide-handle:active { cursor: grabbing; }
.token-compute-guide-grip {
  color: var(--vp-c-text-3);
  font-size: 15px;
  letter-spacing: 0;
}
.token-compute-guide-heading {
  display: grid;
  min-width: 0;
  line-height: 1.25;
}
.token-compute-guide-heading small {
  color: var(--vp-c-brand-1);
  font-size: 10px;
}
.token-compute-guide-heading strong {
  overflow-wrap: anywhere;
  font-size: 13px;
}
.token-compute-guide-step {
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  white-space: nowrap;
}
.token-compute-guide-handle button {
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: var(--vp-c-text-1);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.token-compute-guide-handle button {
  width: 30px;
  height: 30px;
  padding: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 18px;
  line-height: 1;
}
.token-compute-guide-handle button:hover,
.token-compute-guide-handle button:focus-visible {
  border-bottom-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.token-compute-guide-body {
  display: grid;
  gap: 8px;
  padding: 10px 11px 11px;
}
.token-compute-stage-micro .token-compute-guide-body {
  grid-template-columns: 1fr;
  align-items: center;
}
.token-compute-stage-micro .token-compute-guide-progress { grid-column: auto; }
.token-compute-guide-progress {
  height: 4px;
  overflow: hidden;
  background: var(--vp-c-divider);
}
.token-compute-guide-progress i {
  display: block;
  height: 100%;
  background: var(--vp-c-brand-1);
}
.token-compute-guide-status {
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  line-height: 1.3;
}
.token-compute-stage-guide-open .token-compute-stage-label-output { top: 252px; }
.token-compute-tower:fullscreen .token-compute-stage {
  min-height: 420px;
  background: transparent;
}
.token-compute-tower:fullscreen .token-compute-stage-micro { min-height: 0; }
.token-compute-tower:fullscreen .token-compute-stage :deep(.token-compute-tower-canvas) {
  min-height: 420px;
}
.token-compute-tower:fullscreen :deep(.pencil-step-explanation) {
  position: fixed;
  z-index: 10;
  left: 50%;
  bottom: 12px;
  width: min(900px, calc(100vw - 32px));
  max-height: min(240px, 38vh);
  max-height: min(240px, 38dvh);
  overflow: auto;
  margin: 0;
  transform: translateX(-50%);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  box-shadow: 0 -6px 24px rgb(0 0 0 / 24%);
}
.token-compute-stage-label {
  position: absolute;
  z-index: 2;
  display: grid;
  max-width: 150px;
  gap: 1px;
  border-left: 2px solid var(--vp-c-divider);
  padding-left: 8px;
  pointer-events: none;
}
.token-compute-stage-label span {
  color: var(--vp-c-text-2);
  font-size: 10px;
}
.token-compute-stage-label strong {
  overflow-wrap: anywhere;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.4;
}
.token-compute-stage-label-input { bottom: 20px; left: 18px; border-color: var(--pencil-input); }
.token-compute-stage-label-tower { top: 50%; left: 18px; border-color: var(--pencil-process); transform: translateY(-50%); }
.token-compute-stage-label-logits { top: 18px; left: 18px; border-color: var(--pencil-process); }
.token-compute-stage-label-output { top: 18px; right: 18px; border-color: var(--pencil-change); text-align: right; }
.token-compute-loading,
.token-compute-error {
  position: absolute;
  inset: 48% 12px auto;
  margin: 0;
  color: var(--vp-c-text-2);
  text-align: center;
  font-size: 13px;
}
.token-compute-error { color: var(--vp-c-danger-1); }
.token-compute-scale-note {
  display: flex;
  align-items: baseline;
  gap: 8px 16px;
  flex-wrap: wrap;
  padding: 8px 10px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.55;
}
.token-compute-scale-note strong {
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
}
.token-compute-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.token-compute-swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
}
.token-compute-swatch-attention { background: var(--pencil-process); }
.token-compute-swatch-mlp { background: var(--pencil-change); }
.token-compute-line-key {
  width: 13px;
  border-top: 2px solid var(--vp-c-brand-1);
}
.token-compute-wave-key {
  width: 13px;
  height: 7px;
  border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.token-compute-scale-note span:last-child { flex: 1 1 360px; }
.token-compute-tower :deep(.pencil-learning-intent) { margin-inline: 8px; }
.token-compute-tower :deep(.pencil-step-explanation) {
  margin: 10px 8px 0;
  padding: 10px 6px 8px;
  background: transparent;
}
.token-compute-tower :deep(.pencil-step-heading) {
  flex-wrap: wrap;
}
.token-compute-tower :deep(.pencil-step-heading > small) {
  flex: 1 1 100%;
  color: var(--pencil-process);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.45;
}
.token-compute-tower :deep(.pencil-overview-list small) {
  display: block;
  margin-top: 2px;
  color: var(--pencil-process);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  line-height: 1.45;
}
@media (max-width: 1279px) {
  .token-compute-tower { width: min(870px, calc(100vw - 320px)); }
}
@media (max-width: 900px) {
  .token-compute-tower { width: calc(100vw - 32px); }
  .token-compute-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .token-compute-toolbar { display: grid; grid-template-columns: 1fr auto; }
  .token-compute-actions { grid-column: 1 / -1; }
}
@media (max-width: 699px) {
  .token-compute-tower { width: calc(100vw - 40px); }
  .token-compute-toolbar { grid-template-columns: 1fr; }
  .token-compute-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .token-compute-metrics-micro { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .token-compute-metrics > div { min-height: 62px; padding: 7px 8px; }
  .token-compute-stage { min-height: 460px; }
  .token-compute-stage-micro {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    /* Keep global feedback/support entries outside the reading column. */
    padding-right: 54px;
  }
  .token-compute-stage:not(.token-compute-stage-micro) { margin-right: 44px; }
  .token-compute-stage :deep(.token-compute-tower-canvas) { min-height: 460px; }
  .token-compute-microscope {
    gap: 8px;
    padding: 0 9px 20px;
  }
  .token-compute-stage-micro .token-compute-guide {
    position: relative;
    inset: auto !important;
    order: 1;
    align-self: center;
    width: min(340px, calc(100% - 16px));
  }
  .token-compute-stage-micro .token-compute-microscope { order: 2; }
  .token-compute-guide { top: 8px; right: 8px; width: calc(100% - 16px); }
  .token-compute-guide-collapsed { width: min(230px, calc(100% - 16px)); }
  .token-compute-guide-body { padding: 9px; }
  .token-compute-stage-micro .token-compute-guide-body { grid-template-columns: 1fr; }
  .token-compute-micro-scope { display: grid; }
  .token-compute-micro-scope span { text-align: left; }
  .token-compute-micro-path { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .token-compute-micro-overview { grid-template-columns: 1fr; }
  .token-compute-micro-scene { min-height: 0; }
  .token-compute-micro-history-lane {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .token-compute-micro-history-lane .token-compute-micro-lane-label { grid-column: 1 / -1; }
  .token-compute-micro-current-lane,
  .token-compute-micro-project-map,
  .token-compute-micro-score-pipeline,
  .token-compute-micro-context-map,
  .token-compute-micro-equation-flow,
  .token-compute-micro-mlp-flow,
  .token-compute-micro-mlp-residual,
  .token-compute-micro-head-flow {
    grid-template-columns: 1fr;
  }
  .token-compute-micro-project-input,
  .token-compute-micro-project-map :deep(.pencil-action-arrow),
  .token-compute-micro-projection-result {
    grid-column: 1 !important;
    grid-row: auto !important;
  }
  .token-compute-micro-score-pipeline,
  .token-compute-micro-context-map,
  .token-compute-micro-equation-flow,
  .token-compute-micro-mlp-flow,
  .token-compute-micro-head-flow { gap: 7px; }
  .token-compute-micro-score-table > div {
    grid-template-columns: 48px 64px minmax(80px, 1fr) 36px;
    gap: 5px;
  }
  .token-compute-micro-vocab { grid-template-columns: 1fr; }
  .token-compute-micro-select-result :deep(.pencil-action-arrow) { width: 100%; }
  .token-compute-stage-label-tower { top: 46%; }
  .token-compute-stage-label { max-width: 118px; }
  .token-compute-stage-label-output { top: 12px; right: 12px; }
  .token-compute-stage-label-logits { top: 12px; left: 12px; }
  .token-compute-stage-guide-open .token-compute-stage-label-logits { top: 252px; }
  .token-compute-stage-guide-open .token-compute-stage-label-output { top: 252px; }
  .token-compute-stage-label-input { bottom: 12px; left: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .token-compute-toolbar button { transition: none; }
  .token-compute-micro-matrix i,
  .token-compute-micro-score-table b,
  .token-compute-micro-vocab b { animation: none; }
}
</style>
