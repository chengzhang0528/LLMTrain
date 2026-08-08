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
let timer: ReturnType<typeof setInterval> | undefined;
let themeObserver: MutationObserver | undefined;
let resizeObserver: ResizeObserver | undefined;
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

function markIsActive(id: string) {
  return viewMode.value === "static" || Boolean(current.value?.active.includes(id));
}

function syncSketchState() {
  if (!roughLayer.value) return;
  for (const mark of roughLayer.value.querySelectorAll<SVGGElement>("[data-pencil-mark]")) {
    const active = markIsActive(mark.dataset.pencilMark ?? "");
    mark.style.opacity = active ? "1" : "0.16";
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
    const options = { stroke: ink, strokeWidth: 1.55, roughness: 1.45, bowing: 0.8, seed: 101 + index };
    wrapper.appendChild(rough.line(points.x1, points.y1, points.x2, points.y2, options));

    const angle = Math.atan2(points.y2 - points.y1, points.x2 - points.x1);
    const size = 10;
    wrapper.appendChild(
      rough.line(
        points.x2,
        points.y2,
        points.x2 - size * Math.cos(angle - Math.PI / 6),
        points.y2 - size * Math.sin(angle - Math.PI / 6),
        { ...options, seed: 201 + index }
      )
    );
    wrapper.appendChild(
      rough.line(
        points.x2,
        points.y2,
        points.x2 - size * Math.cos(angle + Math.PI / 6),
        points.y2 - size * Math.sin(angle + Math.PI / 6),
        { ...options, seed: 301 + index }
      )
    );
    layer.appendChild(wrapper);
  }

  for (const [index, node] of layoutNodes.value.entries()) {
    const { width, height } = nodeSize(node);
    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.dataset.pencilMark = node.id;
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

watch([currentStep, viewMode], () =>
  nextTick(() => {
    if (narrowLayout.value) drawSketch();
    else syncSketchState();
  })
);

onMounted(async () => {
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
  themeObserver?.disconnect();
  resizeObserver?.disconnect();
});
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
        <button type="button" :aria-label="playing ? '暂停' : '播放'" :title="playing ? '暂停' : '播放'" :disabled="viewMode === 'static'" @click="play">
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
          :class="[`tone-${node.tone ?? 'neutral'}`, { active: markIsActive(node.id) }]"
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
          :class="{ active: markIsActive(edge.id) }"
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
