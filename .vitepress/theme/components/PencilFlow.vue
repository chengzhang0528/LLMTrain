<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import PencilLearningIntent from "./PencilLearningIntent.vue";
import PencilStepExplanation from "./PencilStepExplanation.vue";

type FlowNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  tone?: "input" | "process" | "change" | "neutral";
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  mobileHidden?: boolean;
};

type FlowStep = {
  title: string;
  purpose: string;
  detail: string;
  watch: string;
  reflection: string;
  active: string[];
};

type FlowSpec = {
  ariaLabel: string;
  learningGoal: string;
  watchFor: string;
  mode?: "animated" | "static";
  nodes: FlowNode[];
  edges: FlowEdge[];
  steps?: FlowStep[];
};

type MarkState = "overview" | "complete" | "current" | "future";

const EDGE_DRAW_DURATION = 760;
const EDGE_DRAW_GAP = 100;
const ARROW_DRAW_DURATION = 180;

const props = defineProps<{ spec: string }>();
const scene = computed<FlowSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const figureElement = ref<HTMLElement | null>(null);
const svgElement = ref<SVGSVGElement | null>(null);
const roughLayer = ref<SVGGElement | null>(null);
const currentStep = ref(0);
const viewMode = ref<"motion" | "static">(scene.value.mode === "static" ? "static" : "motion");
const playing = ref(false);
const ready = ref(false);
const narrowLayout = ref(false);
const reducedMotion = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let themeObserver: MutationObserver | undefined;
let resizeObserver: ResizeObserver | undefined;
let motionPreference: MediaQueryList | undefined;
let markAnimations: Animation[] = [];
let roughApi: any;

const steps = computed(() => scene.value.steps ?? []);
const current = computed(() => steps.value[currentStep.value]);
const sceneDescription = computed(() =>
  viewMode.value === "static"
    ? "显示完整流程及各步骤用途"
    : `${current.value?.title ?? "流程起点"}。${current.value?.purpose ?? ""}`
);
const compactMotionLayout = computed(() => narrowLayout.value && viewMode.value === "motion" && Boolean(current.value));
const layoutNodes = computed<FlowNode[]>(() => {
  if (!narrowLayout.value) return scene.value.nodes;
  const sourceNodes = compactMotionLayout.value
    ? scene.value.nodes.filter((node) => current.value?.active.includes(node.id))
    : scene.value.nodes;
  return sourceNodes.map((node, index) => ({
    ...node,
    x: 180,
    y: compactMotionLayout.value
      ? 132 + (index - (sourceNodes.length - 1) / 2) * 92
      : 54 + index * 92,
    width: Math.min(Math.max(node.width ?? 144, 168), 220),
    height: node.height ?? 56
  }));
});
const layoutNodeIds = computed(() => new Set(layoutNodes.value.map((node) => node.id)));
const flowViewBox = computed(() =>
  narrowLayout.value
    ? compactMotionLayout.value
      ? "0 0 360 264"
      : `0 0 360 ${Math.max(180, 108 + (layoutNodes.value.length - 1) * 92)}`
    : "0 0 760 220"
);
const visibleEdges = computed(() =>
  scene.value.edges.filter(
    (edge) =>
      !(narrowLayout.value && edge.mobileHidden) &&
      layoutNodeIds.value.has(edge.from) &&
      layoutNodeIds.value.has(edge.to)
  )
);
const currentEdges = computed(() =>
  visibleEdges.value.filter((edge) => current.value?.active.includes(edge.id))
);

function nodeById(id: string) {
  return layoutNodes.value.find((node) => node.id === id);
}

function nodeSize(node: FlowNode) {
  return { width: node.width ?? 144, height: node.height ?? 56 };
}

function edgePoints(edge: FlowEdge) {
  const from = nodeById(edge.from);
  const to = nodeById(edge.to);
  if (!from || !to) return null;

  const fromSize = nodeSize(from);
  const toSize = nodeSize(to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const fromRadius = Math.min(fromSize.width / Math.max(Math.abs(ux), 0.01) / 2, fromSize.height / Math.max(Math.abs(uy), 0.01) / 2);
  const toRadius = Math.min(toSize.width / Math.max(Math.abs(ux), 0.01) / 2, toSize.height / Math.max(Math.abs(uy), 0.01) / 2);

  return {
    x1: from.x + ux * Math.min(fromRadius, 62),
    y1: from.y + uy * Math.min(fromRadius, 28),
    x2: to.x - ux * Math.min(toRadius, 62),
    y2: to.y - uy * Math.min(toRadius, 28),
    ux,
    uy
  };
}

function edgeLabelPosition(edge: FlowEdge) {
  const from = nodeById(edge.from);
  const to = nodeById(edge.to);
  return {
    x: ((from?.x ?? 0) + (to?.x ?? 0)) / 2 + (narrowLayout.value ? 22 : 0),
    y: ((from?.y ?? 0) + (to?.y ?? 0)) / 2 + (narrowLayout.value ? 4 : -10),
    anchor: narrowLayout.value ? "start" : "middle"
  };
}

function markState(id: string): MarkState {
  if (viewMode.value === "static" || reducedMotion.value) return "overview";
  if (current.value?.active.includes(id)) return "current";
  if (steps.value.slice(0, currentStep.value).some((step) => step.active.includes(id))) return "complete";
  return "future";
}

function markIsRevealed(id: string) {
  return markState(id) !== "future";
}

function shouldAnimateCurrentMarks() {
  return scene.value.mode === "animated" && viewMode.value === "motion" && !reducedMotion.value;
}

function edgeDrawDelay(id: string) {
  const index = currentEdges.value.findIndex((edge) => edge.id === id);
  return index < 0 ? undefined : index * (EDGE_DRAW_DURATION + EDGE_DRAW_GAP);
}

function edgeLabelStyle(id: string) {
  const delay = edgeDrawDelay(id);
  return delay === undefined
    ? undefined
    : { "--pencil-draw-delay": `${Math.round(delay + EDGE_DRAW_DURATION * 0.68)}ms` };
}

function nodeArrivalDelay(id: string) {
  const arrivingEdgeIndex = currentEdges.value.findLastIndex((edge) => edge.to === id);
  return arrivingEdgeIndex < 0
    ? undefined
    : arrivingEdgeIndex * (EDGE_DRAW_DURATION + EDGE_DRAW_GAP) + EDGE_DRAW_DURATION * 0.82;
}

function nodeArrivalStyle(id: string) {
  const delay = nodeArrivalDelay(id);
  return delay === undefined ? undefined : { "--pencil-draw-delay": `${Math.round(delay)}ms` };
}

function cancelMarkAnimations() {
  for (const animation of markAnimations) animation.cancel();
  markAnimations = [];
}

function animatePaths(paths: SVGPathElement[], delay: number, duration: number, startOpacity: number) {
  for (const path of paths) {
    const length = Math.max(path.getTotalLength(), 1);
    path.style.strokeDasharray = `${length} ${length}`;
    path.style.strokeDashoffset = "0";
    markAnimations.push(
      path.animate(
        [
          { strokeDashoffset: `${length}`, opacity: startOpacity },
          { strokeDashoffset: "0", opacity: 1 }
        ],
        {
          delay,
          duration,
          easing: "cubic-bezier(0.32, 0, 0.18, 1)",
          fill: "backwards"
        }
      )
    );
  }
}

function animateCurrentEdge(mark: SVGGElement, id: string) {
  const delay = edgeDrawDelay(id);
  if (delay === undefined) return;
  const shaftPaths = Array.from(mark.querySelectorAll<SVGPathElement>('[data-pencil-edge-part="shaft"] path'));
  const arrowPaths = Array.from(mark.querySelectorAll<SVGPathElement>('[data-pencil-edge-part="arrow"] path'));
  animatePaths(shaftPaths, delay, EDGE_DRAW_DURATION, 0.16);
  animatePaths(arrowPaths, delay + EDGE_DRAW_DURATION, ARROW_DRAW_DURATION, 0);
}

function animateArrivingNode(mark: SVGGElement, id: string) {
  const delay = nodeArrivalDelay(id);
  if (delay === undefined) return;
  markAnimations.push(
    mark.animate([{ opacity: 0.18 }, { opacity: 1 }], {
      delay,
      duration: 260,
      easing: "ease-out",
      fill: "backwards"
    })
  );
}

function syncSketchState() {
  if (!roughLayer.value) return;
  cancelMarkAnimations();
  for (const mark of roughLayer.value.querySelectorAll<SVGGElement>("[data-pencil-mark]")) {
    const id = mark.dataset.pencilMark ?? "";
    const state = markState(id);
    mark.dataset.pencilState = state;
    for (const path of mark.querySelectorAll<SVGPathElement>("path")) {
      path.style.strokeDasharray = "";
      path.style.strokeDashoffset = "";
    }
    if (!shouldAnimateCurrentMarks() || state !== "current") continue;
    if (mark.dataset.pencilKind === "edge") animateCurrentEdge(mark, id);
    if (mark.dataset.pencilKind === "node") animateArrivingNode(mark, id);
  }
}

function drawSketch() {
  if (!svgElement.value || !roughLayer.value || !roughApi) return;
  const svg = svgElement.value;
  const layer = roughLayer.value;
  layer.replaceChildren();
  const rough = roughApi.svg(svg);
  const styles = getComputedStyle(svg);
  const ink = styles.getPropertyValue("--pencil-ink").trim() || "#38423f";

  for (const [index, edge] of visibleEdges.value.entries()) {
    const points = edgePoints(edge);
    if (!points) continue;
    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.dataset.pencilMark = edge.id;
    wrapper.dataset.pencilKind = "edge";
    const options = { stroke: ink, strokeWidth: 1.55, roughness: 1.45, bowing: 0.8, seed: 101 + index };
    const shaft = rough.line(points.x1, points.y1, points.x2, points.y2, options);
    shaft.dataset.pencilEdgePart = "shaft";
    wrapper.appendChild(shaft);

    const angle = Math.atan2(points.y2 - points.y1, points.x2 - points.x1);
    const size = 10;
    for (const [seed, direction] of [[201 + index, -1], [301 + index, 1]] as const) {
      const arrow = rough.line(
        points.x2,
        points.y2,
        points.x2 - size * Math.cos(angle + direction * Math.PI / 6),
        points.y2 - size * Math.sin(angle + direction * Math.PI / 6),
        { ...options, seed }
      );
      arrow.dataset.pencilEdgePart = "arrow";
      wrapper.appendChild(arrow);
    }
    layer.appendChild(wrapper);
  }

  for (const [index, node] of layoutNodes.value.entries()) {
    const { width, height } = nodeSize(node);
    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.dataset.pencilMark = node.id;
    wrapper.dataset.pencilKind = "node";
    wrapper.appendChild(
      rough.rectangle(node.x - width / 2, node.y - height / 2, width, height, {
        stroke: ink,
        strokeWidth: 1.7,
        roughness: 1.35,
        bowing: 0.7,
        seed: 401 + index
      })
    );
    layer.appendChild(wrapper);
  }

  syncSketchState();
  ready.value = true;
}

function stop() {
  playing.value = false;
  if (timer) clearInterval(timer);
  timer = undefined;
}

function play() {
  if (viewMode.value === "static" || reducedMotion.value || steps.value.length < 2) return;
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

watch([currentStep, viewMode, reducedMotion], () =>
  nextTick(() => {
    if (narrowLayout.value) drawSketch();
    else syncSketchState();
  })
);

onMounted(async () => {
  motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.value = motionPreference.matches;
  motionPreference.addEventListener("change", handleMotionPreference);
  resizeObserver = new ResizeObserver(([entry]) => {
    const nextLayout = entry.contentRect.width <= 520;
    if (nextLayout === narrowLayout.value) return;
    narrowLayout.value = nextLayout;
    nextTick(drawSketch);
  });
  if (figureElement.value) resizeObserver.observe(figureElement.value);

  const module = await import("../../vendor/rough.esm.js");
  roughApi = module.default;
  drawSketch();
  themeObserver = new MutationObserver(drawSketch);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});

onBeforeUnmount(() => {
  stop();
  cancelMarkAnimations();
  themeObserver?.disconnect();
  resizeObserver?.disconnect();
  motionPreference?.removeEventListener("change", handleMotionPreference);
});

function handleMotionPreference(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
  if (event.matches) stop();
}
</script>

<template>
  <figure ref="figureElement" class="pencil-visual pencil-flow" :class="{ 'is-ready': ready, 'is-narrow': narrowLayout }">
    <PencilLearningIntent :learning-goal="scene.learningGoal" :watch-for="scene.watchFor" />

    <div class="pencil-controls" aria-label="流程图显示控制">
      <div class="pencil-segmented" aria-label="显示模式">
        <button type="button" :aria-pressed="viewMode === 'motion'" @click="setMode('motion')">逐步讲解</button>
        <button type="button" :aria-pressed="viewMode === 'static'" @click="setMode('static')">流程总览</button>
      </div>
      <div class="pencil-step-controls">
        <button type="button" aria-label="上一步" title="上一步" :disabled="viewMode === 'static' || currentStep === 0" @click="previous">←</button>
        <button type="button" :aria-label="playing ? '暂停' : '播放'" :title="playing ? '暂停' : '播放'" :disabled="viewMode === 'static' || reducedMotion" @click="play">
          {{ playing ? "Ⅱ" : "▶" }}
        </button>
        <button type="button" aria-label="下一步" title="下一步" :disabled="viewMode === 'static' || currentStep >= steps.length - 1" @click="next">→</button>
      </div>
    </div>

    <svg ref="svgElement" :viewBox="flowViewBox" role="img" :aria-label="scene.ariaLabel">
      <title>{{ scene.ariaLabel }}</title>
      <desc>{{ sceneDescription }}</desc>
      <g ref="roughLayer" class="pencil-rough-layer" />
      <g class="pencil-flow-labels">
        <g
          v-for="node in layoutNodes"
          :key="node.id"
          class="pencil-flow-node"
          :class="[
            `tone-${node.tone ?? 'neutral'}`,
            `state-${markState(node.id)}`,
            {
              active: markIsRevealed(node.id),
              'is-arrival': ready && shouldAnimateCurrentMarks() && nodeArrivalDelay(node.id) !== undefined
            }
          ]"
          :style="nodeArrivalStyle(node.id)"
        >
          <rect
            :x="node.x - (node.width ?? 144) / 2"
            :y="node.y - (node.height ?? 56) / 2"
            :width="node.width ?? 144"
            :height="node.height ?? 56"
            rx="3"
          />
          <text :x="node.x" :y="node.y" text-anchor="middle" dominant-baseline="middle">{{ node.label }}</text>
        </g>
        <text
          v-for="edge in visibleEdges.filter((item) => item.label)"
          :key="`${edge.id}-label`"
          class="pencil-edge-label"
          :class="[
            `state-${markState(edge.id)}`,
            { 'is-drawing': ready && shouldAnimateCurrentMarks() && markState(edge.id) === 'current' }
          ]"
          :style="edgeLabelStyle(edge.id)"
          :x="edgeLabelPosition(edge).x"
          :y="edgeLabelPosition(edge).y"
          :text-anchor="edgeLabelPosition(edge).anchor"
        >{{ edge.label }}</text>
      </g>
    </svg>

    <PencilStepExplanation
      :steps="steps"
      :current-step="currentStep"
      :view-mode="viewMode"
      :overview="scene.ariaLabel"
    />
  </figure>
</template>
