<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import PencilLearningIntent from "./PencilLearningIntent.vue";
import PencilStepExplanation from "./PencilStepExplanation.vue";

type VectorSpec = {
  id: string;
  label: string;
  value: [number, number, number];
  tone?: "input" | "process" | "change";
};

type SceneStep = {
  title: string;
  purpose: string;
  detail: string;
  watch: string;
  reflection: string;
  active: string[];
};

type SceneSpec = {
  ariaLabel: string;
  learningGoal: string;
  watchFor: string;
  mode?: "animated" | "static";
  vectors: VectorSpec[];
  steps?: SceneStep[];
  result?: string;
};

const props = defineProps<{ spec: string }>();
const sceneSpec = computed<SceneSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const host = ref<HTMLDivElement | null>(null);
const ready = ref(false);
const errorMessage = ref("");
const currentStep = ref(0);
const viewMode = ref<"motion" | "static">(sceneSpec.value.mode === "static" ? "static" : "motion");
const playing = ref(false);
const steps = computed(() => sceneSpec.value.steps ?? []);
const current = computed(() => steps.value[currentStep.value]);

let THREE: any;
let threeScene: any;
let camera: any;
let renderer: any;
let resizeObserver: ResizeObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let themeObserver: MutationObserver | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let animationFrame = 0;
let revealStart = 0;
let revealIds = new Set<string>();
let initialized = false;
const vectorGroups = new Map<string, any>();

let radius = 9;
let theta = 0.78;
let phi = 1.03;
let dragging = false;
let pointerX = 0;
let pointerY = 0;

function cssColor(name: string, fallback: string) {
  if (!host.value) return fallback;
  return getComputedStyle(host.value).getPropertyValue(name).trim() || fallback;
}

function toneColor(tone: VectorSpec["tone"]) {
  if (tone === "change") return cssColor("--pencil-change", "#a45f06");
  if (tone === "process") return cssColor("--pencil-process", "#2873a6");
  return cssColor("--pencil-input", "#126e63");
}

function createLine(points: any[], color: string, opacity = 1, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.16, gapSize: 0.1 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function createVector(vector: VectorSpec, index: number) {
  const group = new THREE.Group();
  group.userData.vectorId = vector.id;
  const endpoint = new THREE.Vector3(...vector.value);
  const direction = endpoint.clone().normalize();
  const color = toneColor(vector.tone);

  group.add(createLine([new THREE.Vector3(0, 0, 0), endpoint], color, 0.94));
  const jitter = 0.022 + index * 0.004;
  group.add(
    createLine(
      [new THREE.Vector3(jitter, -jitter, 0), endpoint.clone().add(new THREE.Vector3(-jitter, jitter, jitter))],
      color,
      0.34
    )
  );

  const coneGeometry = new THREE.ConeGeometry(0.12, 0.34, 7);
  const coneEdges = new THREE.EdgesGeometry(coneGeometry);
  const cone = new THREE.LineSegments(
    coneEdges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  cone.position.copy(endpoint.clone().sub(direction.multiplyScalar(0.15)));
  group.add(cone);

  const [x, y, z] = vector.value;
  const componentColor = cssColor("--pencil-muted", "#8a9692");
  group.add(createLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, 0, 0)], componentColor, 0.55, true));
  group.add(createLine([new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, y, z)], componentColor, 0.55, true));
  return group;
}

function buildScene() {
  if (!host.value || !THREE) return;
  vectorGroups.clear();
  threeScene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "pencil-3d-canvas";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", sceneSpec.value.ariaLabel);
  host.value.prepend(renderer.domElement);

  const gridColor = cssColor("--pencil-grid", "#cdd4d1");
  const grid = new THREE.GridHelper(10, 10, gridColor, gridColor);
  grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  threeScene.add(grid);

  const ink = cssColor("--pencil-ink", "#38423f");
  const axisPoints = [
    [new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0)],
    [new THREE.Vector3(0, -4, 0), new THREE.Vector3(0, 4, 0)],
    [new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, 3)]
  ];
  for (const points of axisPoints) threeScene.add(createLine(points, ink, 0.42));

  sceneSpec.value.vectors.forEach((vector, index) => {
    const group = createVector(vector, index);
    vectorGroups.set(vector.id, group);
    threeScene.add(group);
  });

  updateCamera();
  updateVisibility(false);
  resize();
  bindPointerControls();
  ready.value = true;
}

function updateCamera() {
  if (!camera) return;
  camera.position.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  camera.lookAt(0, 0, 0);
}

function visibleVectorIds() {
  if (viewMode.value === "static") return new Set(sceneSpec.value.vectors.map((vector) => vector.id));
  return new Set(steps.value.slice(0, currentStep.value + 1).flatMap((step) => step.active));
}

function updateVisibility(animate = true) {
  if (!renderer) return;
  const visible = visibleVectorIds();
  revealIds = new Set(current.value?.active ?? []);
  revealStart = performance.now();

  for (const [id, group] of vectorGroups) {
    group.visible = visible.has(id);
    group.scale.setScalar(animate && viewMode.value === "motion" && revealIds.has(id) ? 0.001 : 1);
  }

  animateReveal();
}

function animateReveal() {
  cancelAnimationFrame(animationFrame);
  const render = (now: number) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const progress = reduceMotion ? 1 : Math.min(1, (now - revealStart) / 520);
    const eased = 1 - Math.pow(1 - progress, 3);
    for (const id of revealIds) {
      const group = vectorGroups.get(id);
      if (group?.visible) group.scale.setScalar(Math.max(0.001, eased));
    }
    renderOnce();
    if (progress < 1) animationFrame = requestAnimationFrame(render);
  };
  animationFrame = requestAnimationFrame(render);
}

function updateLabels() {
  if (!host.value || !camera || !renderer) return;
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  for (const vector of sceneSpec.value.vectors) {
    const label = host.value.querySelector<HTMLElement>(`[data-vector-label="${vector.id}"]`);
    const group = vectorGroups.get(vector.id);
    if (!label || !group?.visible) {
      if (label) label.hidden = true;
      continue;
    }
    label.hidden = false;
    const projected = new THREE.Vector3(...vector.value).project(camera);
    const rawX = (projected.x * 0.5 + 0.5) * width;
    const rawY = (-projected.y * 0.5 + 0.5) * height;
    const edgeGap = 8;
    const halfWidth = label.offsetWidth / 2;
    const halfHeight = label.offsetHeight / 2;
    const x = Math.max(halfWidth + edgeGap, Math.min(width - halfWidth - edgeGap, rawX));
    const y = Math.max(halfHeight + edgeGap, Math.min(height - halfHeight - edgeGap, rawY));
    label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }
}

function renderOnce() {
  if (!renderer || !threeScene || !camera) return;
  renderer.render(threeScene, camera);
  updateLabels();
}

function resize() {
  if (!host.value || !renderer || !camera) return;
  const width = Math.max(280, host.value.clientWidth);
  const height = Math.min(390, Math.max(300, width * 0.52));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderOnce();
}

function bindPointerControls() {
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
    phi = Math.max(0.35, Math.min(1.42, phi + (event.clientY - pointerY) * 0.008));
    pointerX = event.clientX;
    pointerY = event.clientY;
    updateCamera();
    renderOnce();
  });
  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      radius = Math.max(5.5, Math.min(13, radius + event.deltaY * 0.01));
      updateCamera();
      renderOnce();
    },
    { passive: false }
  );
}

function resetView() {
  radius = 9;
  theta = 0.78;
  phi = 1.03;
  updateCamera();
  renderOnce();
}

function stop() {
  playing.value = false;
  if (timer) clearInterval(timer);
  timer = undefined;
}

function play() {
  if (viewMode.value === "static" || steps.value.length < 2) return;
  if (playing.value) {
    stop();
    return;
  }
  if (currentStep.value >= steps.value.length - 1) currentStep.value = 0;
  playing.value = true;
  timer = setInterval(() => {
    currentStep.value += 1;
    if (currentStep.value >= steps.value.length - 1) stop();
  }, 7000);
}

function previous() {
  stop();
  currentStep.value = Math.max(0, currentStep.value - 1);
}

function next() {
  stop();
  currentStep.value = Math.min(steps.value.length - 1, currentStep.value + 1);
}

function setMode(mode: "motion" | "static") {
  stop();
  viewMode.value = mode;
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  try {
    THREE = await import("../../vendor/three.module.min.js");
    buildScene();
    resizeObserver = new ResizeObserver(resize);
    if (host.value) resizeObserver.observe(host.value);
    themeObserver = new MutationObserver(() => {
      renderer?.dispose();
      renderer?.domElement.remove();
      buildScene();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "无法初始化三维视图";
  }
}

watch([currentStep, viewMode], () => nextTick(() => updateVisibility(true)));

onMounted(() => {
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        initialize();
        intersectionObserver?.disconnect();
      }
    },
    { rootMargin: "160px" }
  );
  if (host.value) intersectionObserver.observe(host.value);
});

onBeforeUnmount(() => {
  stop();
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  themeObserver?.disconnect();
  renderer?.dispose();
});
</script>

<template>
  <figure class="pencil-visual pencil-scene-3d">
    <PencilLearningIntent :learning-goal="sceneSpec.learningGoal" :watch-for="sceneSpec.watchFor" />

    <div class="pencil-controls" aria-label="三维视图控制">
      <div class="pencil-segmented" aria-label="显示模式">
        <button type="button" :aria-pressed="viewMode === 'motion'" @click="setMode('motion')">逐步讲解</button>
        <button type="button" :aria-pressed="viewMode === 'static'" @click="setMode('static')">流程总览</button>
      </div>
      <div class="pencil-step-controls">
        <button type="button" aria-label="上一步" title="上一步" :disabled="viewMode === 'static' || currentStep === 0" @click="previous">←</button>
        <button type="button" :aria-label="playing ? '暂停' : '播放'" :title="playing ? '暂停' : '播放'" :disabled="viewMode === 'static'" @click="play">
          {{ playing ? "Ⅱ" : "▶" }}
        </button>
        <button type="button" aria-label="下一步" title="下一步" :disabled="viewMode === 'static' || currentStep >= steps.length - 1" @click="next">→</button>
        <button type="button" aria-label="复位视角" title="复位视角" @click="resetView">↺</button>
      </div>
    </div>

    <div ref="host" class="pencil-3d-host">
      <span
        v-for="vector in sceneSpec.vectors"
        :key="vector.id"
        class="pencil-3d-label"
        :class="`tone-${vector.tone ?? 'input'}`"
        :data-vector-label="vector.id"
      >{{ vector.label }}</span>
      <p v-if="!ready && !errorMessage" class="pencil-loading">正在绘制三维铅笔视图...</p>
      <p v-if="errorMessage" class="pencil-error">三维视图不可用：{{ errorMessage }}</p>
    </div>

    <PencilStepExplanation
      :steps="steps"
      :current-step="currentStep"
      :view-mode="viewMode"
      :overview="sceneSpec.result"
    />
  </figure>
</template>
