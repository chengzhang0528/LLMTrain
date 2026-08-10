<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import PencilLearningIntent from "./PencilLearningIntent.vue";
import PencilStepExplanation from "./PencilStepExplanation.vue";

type RuntimeKind = "input" | "represent" | "compute" | "choose" | "system";
type RuntimeNode = { id: string; label: string; shape: string; measureLabel?: string; kind: RuntimeKind; owner?: string };
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
const isFullscreen = ref(false);
const canvasHost = ref<HTMLDivElement | null>(null);
const canvasReady = ref(false);
const canvasError = ref("");

const activeMode = computed(() => scene.value.modes.find((mode) => mode.id === modeId.value) ?? scene.value.modes[0]);
const steps = computed(() => activeMode.value?.steps ?? []);
const current = computed(() => steps.value[currentStep.value] ?? steps.value[0]);
const selectedNode = computed(() => activeMode.value?.nodes.find((node) => node.id === selectedNodeId.value) ?? activeMode.value?.nodes[0]);
const activeNodeIds = computed(() => {
  if (viewMode.value === "overview") return new Set(activeMode.value?.nodes.map((node) => node.id) ?? []);
  return new Set(current.value?.active ?? []);
});
const detailStep = computed(() => (viewMode.value === "overview" ? undefined : current.value));
const detailMeasureLabel = computed(() =>
  detailStep.value?.measureLabel ?? selectedNode.value?.measureLabel ?? "当前形状"
);
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

let THREE: any;
let threeScene: any;
let camera: any;
let renderer: any;
let resizeObserver: ResizeObserver | undefined;
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
const parameterGroups = new Map<string, any>();
let tokenMesh: any;

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

function setCamera() {
  if (!camera) return;
  camera.position.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  camera.lookAt(0, 0, 0);
}

function lineBetween(from: any, to: any) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: cssColor("--pencil-grid", "#cdd4d1"), transparent: true, opacity: 0.34 })
  );
}

function disposeScene() {
  if (!threeScene) return;
  threeScene.traverse((object: any) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}

function createParameterCloud(color: string) {
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

function buildScene() {
  if (!canvasHost.value || !THREE || !activeMode.value) return;
  stopPath();
  disposeScene();
  renderer?.dispose();
  renderer?.domElement.remove();
  nodeGroups.clear();
  nodePositions.clear();
  parameterGroups.clear();
  threeScene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.domElement.className = "model-runtime-canvas";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", scene.value.ariaLabel);
  canvasHost.value.prepend(renderer.domElement);

  const grid = new THREE.GridHelper(18, 18, cssColor("--pencil-grid", "#cdd4d1"), cssColor("--pencil-grid", "#cdd4d1"));
  grid.position.y = -1.15;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.28;
  }
  threeScene.add(grid);

  const nodes = activeMode.value.nodes;
  const spread = Math.min(1.85, 9.5 / Math.max(1, nodes.length - 1));
  const start = -((nodes.length - 1) * spread) / 2;
  nodes.forEach((node, index) => {
    const position = new THREE.Vector3(start + index * spread, (index % 2) * 0.18 - 0.09, ((index % 3) - 1) * 0.55);
    nodePositions.set(node.id, position);
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1.82, 1.02, 0.82);
    const material = new THREE.MeshBasicMaterial({
      color: kindColor(node.kind),
      transparent: true,
      opacity: 0.25,
      wireframe: true
    });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, 0.84, 0.7),
      new THREE.MeshBasicMaterial({ color: kindColor(node.kind), transparent: true, opacity: 0.06, depthWrite: false })
    );
    group.add(inner);
    const cloud = createParameterCloud(kindColor(node.kind));
    group.add(cloud);
    group.position.copy(position);
    group.userData.mesh = mesh;
    group.userData.parameters = cloud;
    threeScene.add(group);
    nodeGroups.set(node.id, group);
    parameterGroups.set(node.id, cloud);
  });

  for (const edge of activeMode.value.edges) {
    const from = nodePositions.get(edge.from);
    const to = nodePositions.get(edge.to);
    if (from && to) threeScene.add(lineBetween(from, to));
  }

  tokenMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 6),
    new THREE.MeshBasicMaterial({ color: cssColor("--pencil-change", "#a45f06"), transparent: true, opacity: 0.86 })
  );
  threeScene.add(tokenMesh);
  setCamera();
  resize();
  bindPointerControls();
  canvasReady.value = true;
  updateScene();
}

function resize() {
  if (!canvasHost.value || !renderer || !camera) return;
  const width = Math.max(280, canvasHost.value.clientWidth);
  const height = document.fullscreenElement === canvasHost.value
    ? Math.max(320, window.innerHeight - 42)
    : Math.min(360, Math.max(250, width * 0.46));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderOnce();
}

function renderOnce() {
  if (renderer && threeScene && camera) renderer.render(threeScene, camera);
}

function updateScene() {
  if (!renderer) return;
  const visible = activeNodeIds.value;
  for (const node of activeMode.value?.nodes ?? []) {
    const group = nodeGroups.get(node.id);
    const mesh = group?.userData.mesh;
    if (!group || !mesh) continue;
    const active = visible.has(node.id) || viewMode.value === "overview";
    mesh.material.opacity = active ? (node.id === selectedNodeId.value ? 0.92 : 0.48) : 0.12;
    const parameters = parameterGroups.get(node.id);
    if (parameters) parameters.material.opacity = active ? (node.id === selectedNodeId.value ? 0.95 : 0.68) : 0.08;
    group.scale.setScalar(node.id === selectedNodeId.value ? 1.18 : active ? 1 : 0.82);
  }
  const first = [...visible].find((id) => nodePositions.has(id));
  const target = nodePositions.get(first ?? activeMode.value?.nodes[0]?.id);
  if (tokenMesh && target) tokenMesh.position.copy(target).add(new THREE.Vector3(0, 0.6, 0));
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
    event.preventDefault();
    radius = Math.max(7, Math.min(18, radius + event.deltaY * 0.01));
    setCamera();
    renderOnce();
  }, { passive: false });
}

async function toggleFullscreen() {
  if (!canvasHost.value) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await canvasHost.value.requestFullscreen();
  } catch {
    canvasError.value = "当前浏览器不支持全屏示意";
  }
}

function handleFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === canvasHost.value;
  nextTick(resize);
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
  if (renderer) updateScene();
}

function playPath() {
  if (!activeMode.value || activeMode.value.nodes.length < 2) return;
  if (playing.value) {
    stopPath();
    return;
  }
  playing.value = true;
  playStart = performance.now();
  const duration = Math.max(2600, activeMode.value.nodes.length * 620);
  const animate = (now: number) => {
    if (!playing.value || !tokenMesh) return;
    const progress = Math.min(1, (now - playStart) / duration);
    const nodes = activeMode.value.nodes;
    const scaled = progress * (nodes.length - 1);
    const index = Math.min(nodes.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const from = nodePositions.get(nodes[index].id);
    const to = nodePositions.get(nodes[index + 1].id);
    if (from && to) tokenMesh.position.lerpVectors(from, to, local).add(new THREE.Vector3(0, 0.6, 0));
    const focusIndex = Math.min(nodes.length - 1, Math.round(scaled));
    for (const [nodeIndex, node] of nodes.entries()) {
      const parameters = parameterGroups.get(node.id);
      if (parameters) parameters.material.opacity = nodeIndex === focusIndex ? 1 : 0.24;
    }
    renderOnce();
    if (progress >= 1) {
      stopPath();
      return;
    }
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
}

function selectMode(id: string) {
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
  stopPath();
  viewMode.value = "motion";
  currentStep.value = index;
  const focus = steps.value[index]?.active.find((id) => activeMode.value?.nodes.some((node) => node.id === id));
  if (focus) selectedNodeId.value = focus;
  updateScene();
}

function selectNode(id: string) {
  selectedNodeId.value = id;
  const stepIndex = steps.value.findIndex((step) => step.active.includes(id));
  if (stepIndex >= 0) currentStep.value = stepIndex;
  updateScene();
}

function startRebuild() {
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

async function initialize() {
  try {
    THREE = await import("../../vendor/three.module.min.js");
    buildScene();
    resizeObserver = new ResizeObserver(resize);
    if (canvasHost.value) resizeObserver.observe(canvasHost.value);
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
  selectedNodeId.value = activeMode.value?.nodes[0]?.id ?? "";
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  void initialize();
});

onBeforeUnmount(() => {
  stopPath();
  resizeObserver?.disconnect();
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  if (document.fullscreenElement === canvasHost.value) void document.exitFullscreen();
  disposeScene();
  renderer?.dispose();
});
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
        <button type="button" :aria-pressed="viewMode === 'motion'" @click="viewMode = 'motion'">逐步</button>
        <button type="button" :aria-pressed="viewMode === 'overview'" @click="viewMode = 'overview'">总览</button>
      </div>
      <div class="model-runtime-actions">
        <button type="button" @click="playPath">{{ playing ? "暂停计算" : "播放计算" }}</button>
        <button type="button" @click="resetView">复位视角</button>
        <button type="button" :aria-pressed="isFullscreen" :data-tooltip="isFullscreen ? '退出全屏' : '进入全屏'" @click="toggleFullscreen">{{ isFullscreen ? "退出全屏" : "全屏" }}</button>
        <button type="button" @click="startRebuild">闭卷重建</button>
      </div>
    </div>

    <div class="model-runtime-stage-list" role="group" aria-label="模型阶段">
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
      </button>
    </div>

    <div class="model-runtime-main">
      <div ref="canvasHost" class="model-runtime-space" @dblclick="toggleFullscreen">
        <p v-if="!canvasReady && !canvasError" class="model-runtime-loading">正在建立可旋转的空间示意...</p>
        <p v-if="canvasError" class="model-runtime-error">三维示意暂不可用：{{ canvasError }}</p>
        <p class="model-runtime-space-note">每个点代表一个抽样数值：权重块中是参数，激活块中是中间值；外框代表张量块，真实隐藏维度仍以形状标签为准。</p>
      </div>

      <section class="model-runtime-detail" aria-live="polite">
        <p class="model-runtime-kicker">{{ activeMode?.label }} · {{ viewMode === "overview" ? "全链路" : `第 ${currentStep + 1} / ${steps.length} 步` }}</p>
        <h3>{{ detailStep?.title ?? selectedNode?.label }}</h3>
        <p>{{ detailStep?.watch ?? activeMode?.overview }}</p>
        <p v-if="detailStep?.shape || selectedNode?.shape" class="model-runtime-shape">
          <span>{{ detailMeasureLabel }}</span><code>{{ detailStep?.shape ?? selectedNode?.shape }}</code>
        </p>
        <p v-if="selectedNode?.owner" class="model-runtime-owner"><span>主要负责</span>{{ selectedNode.owner }}</p>
        <PencilStepExplanation
          v-if="steps.length"
          :steps="steps"
          :current-step="viewMode === 'overview' ? 0 : currentStep"
          :view-mode="viewMode === 'overview' ? 'static' : 'motion'"
          :overview="activeMode?.overview"
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
  border-block: 1px solid var(--vp-c-divider);
  padding: 12px 0 10px;
  color: var(--pencil-ink);
  background-image: repeating-linear-gradient(0deg, transparent, transparent 23px, color-mix(in srgb, var(--pencil-grid) 22%, transparent) 24px);
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
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 4px 9px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.model-runtime-toolbar button:hover,
.model-runtime-toolbar button:focus-visible,
.model-runtime-toolbar button[aria-pressed="true"],
.model-runtime-rebuild button:hover,
.model-runtime-rebuild button:focus-visible {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.model-runtime-stage-list { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; margin: 0 8px 12px; }
.model-runtime-stage {
  display: grid;
  min-width: 0;
  gap: 3px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 7px 6px;
  text-align: left;
  color: var(--vp-c-text-2);
  background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
  font: inherit;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
}
.model-runtime-stage.active { border-color: color-mix(in srgb, var(--pencil-process) 54%, var(--vp-c-divider)); }
.model-runtime-stage.selected { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); transform: translateY(-2px); }
.model-runtime-stage-index { color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); font-size: 11px; }
.model-runtime-stage-label { overflow-wrap: anywhere; color: var(--vp-c-text-1); font-size: 13px; font-weight: 650; line-height: 1.35; }
.model-runtime-stage code { overflow-wrap: anywhere; color: var(--vp-c-text-2); font-size: 10px; }
.model-runtime-main { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr); gap: 16px; align-items: start; }
.model-runtime-space { position: relative; min-width: 0; min-height: 250px; border-block: 1px solid var(--vp-c-divider); }
.model-runtime-canvas { display: block; width: 100%; height: auto; min-height: 250px; touch-action: none; }
.model-runtime-space:fullscreen { display: flex; flex-direction: column; min-height: 100vh; border: 0; background: var(--vp-c-bg); }
.model-runtime-space:fullscreen .model-runtime-canvas { flex: 1; min-height: 0; }
.model-runtime-space:fullscreen .model-runtime-space-note { flex: 0 0 auto; padding: 9px 18px 14px; text-align: center; }
.model-runtime-loading,
.model-runtime-error { position: absolute; inset: 45% 12px auto; margin: 0; color: var(--vp-c-text-2); text-align: center; font-size: 13px; }
.model-runtime-error { color: var(--vp-c-danger-1); }
.model-runtime-space-note { margin: 0; padding: 5px 8px; color: var(--vp-c-text-2); font-size: 11px; line-height: 1.5; }
.model-runtime-detail { min-width: 0; padding: 2px 8px 0 0; }
.model-runtime-kicker { margin: 0; color: var(--vp-c-brand-1); font-size: 12px; font-weight: 700; }
.model-runtime-detail h3 { margin: 5px 0 7px; color: var(--vp-c-text-1); font-size: 1.05rem; }
.model-runtime-detail > p { margin: 5px 0; color: var(--vp-c-text-2); font-size: 13px; line-height: 1.65; }
.model-runtime-shape,
.model-runtime-owner { display: flex; gap: 7px; align-items: baseline; flex-wrap: wrap; }
.model-runtime-shape span,
.model-runtime-owner span { color: var(--vp-c-text-2); font-size: 11px; }
.model-runtime-shape code { color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); }
.model-runtime-detail :deep(.pencil-step-explanation) { margin: 12px 0 0; padding: 11px 0 0; background: transparent; }
.model-runtime-detail :deep(.pencil-step-details) { margin-bottom: 0; }
.model-runtime-payload { margin: 12px 8px 0; border-top: 1px solid var(--vp-c-divider); padding-top: 9px; }
.model-runtime-payload-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.model-runtime-payload-row strong { width: 52px; color: var(--vp-c-brand-1); font-size: 12px; }
.model-runtime-payload-row span { border: 1px solid var(--vp-c-divider); border-radius: 3px; padding: 2px 6px; color: var(--vp-c-text-1); background: var(--vp-c-bg); font-family: var(--vp-font-family-mono); font-size: 11px; }
.model-runtime-payload p { margin: 5px 0 0; color: var(--vp-c-text-2); font-size: 11px; }
.model-runtime-rebuild { margin: 14px 8px 0; border-top: 1px solid var(--vp-c-divider); padding-top: 12px; }
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
  .model-runtime-stage-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .model-runtime-main { grid-template-columns: minmax(0, 1fr); }
  .model-runtime-detail { padding: 0 8px; }
}
@media (max-width: 560px) {
  .model-runtime-toolbar { grid-template-columns: 1fr; }
  .model-runtime-view { justify-content: flex-start; }
  .model-runtime-stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .model-runtime-space { min-height: 245px; }
  .model-runtime-canvas { min-height: 245px; }
  .model-runtime-rebuild-heading { display: block; }
  .model-runtime-rebuild-heading button { margin-top: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .model-runtime-stage { transition: none; }
}
</style>
