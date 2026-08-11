<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import PencilLearningIntent from "./PencilLearningIntent.vue";
import PencilStepExplanation from "./PencilStepExplanation.vue";

type Tone = "input" | "process" | "change" | "neutral";

type PlaneVector = {
  id: string;
  label: string;
  value: [number, number];
  tone?: Tone;
};

type FormulaLink = {
  id: string;
  label: string;
  expression: string;
  tone?: Tone;
};

type FormulaStep = {
  title: string;
  focus: string;
  watch: string;
  purpose: string;
  detail: string;
  reflection: string;
  active: string[];
  expression: string;
  annotation: string;
};

type FormulaPlaneSpec = {
  ariaLabel: string;
  learningGoal: string;
  watchFor: string;
  mode?: "animated" | "static";
  axes: {
    xLabel: string;
    yLabel: string;
    xRange: [number, number];
    yRange: [number, number];
  };
  vectors: PlaneVector[];
  links: FormulaLink[];
  angleLabel?: string;
  summary: string;
  summaryNote: string;
  boundary: string;
  steps: FormulaStep[];
};

type MarkState = "overview" | "complete" | "current" | "future";

const props = defineProps<{ spec: string }>();
const scene = computed<FormulaPlaneSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const figureElement = ref<HTMLElement | null>(null);
const currentStep = ref(0);
const viewMode = ref<"motion" | "static">(scene.value.mode === "static" ? "static" : "motion");
const playing = ref(false);
const reducedMotion = ref(false);
const instanceId = useId().replace(/:/g, "");
const tones: Tone[] = ["input", "process", "change", "neutral"];

let timer: ReturnType<typeof setInterval> | undefined;
let autoStartTimer: ReturnType<typeof setTimeout> | undefined;
let motionPreference: MediaQueryList | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let hasAutoStarted = false;
let stageInView = false;
let pausedByVisibility = false;

const steps = computed(() => scene.value.steps ?? []);
const current = computed(() => steps.value[currentStep.value]);
const expression = computed(() =>
  viewMode.value === "static" ? scene.value.summary : current.value?.expression ?? scene.value.summary
);
const annotation = computed(() =>
  viewMode.value === "static" ? scene.value.summaryNote : current.value?.annotation ?? scene.value.summaryNote
);
const stageDescription = computed(() =>
  viewMode.value === "static"
    ? `${scene.value.ariaLabel}。${scene.value.summaryNote}`
    : `${current.value?.title ?? "公式图解"}。${current.value?.focus ?? ""}。${annotation.value}`
);

const plot = { left: 54, top: 32, width: 336, height: 235.2 };

function rangeTicks([minimum, maximum]: [number, number]) {
  const start = Math.ceil(minimum);
  const end = Math.floor(maximum);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

const xTicks = computed(() => rangeTicks(scene.value.axes.xRange));
const yTicks = computed(() => rangeTicks(scene.value.axes.yRange));

function xPosition(value: number) {
  const [minimum, maximum] = scene.value.axes.xRange;
  return plot.left + ((value - minimum) / (maximum - minimum)) * plot.width;
}

function yPosition(value: number) {
  const [minimum, maximum] = scene.value.axes.yRange;
  return plot.top + ((maximum - value) / (maximum - minimum)) * plot.height;
}

function vectorPoint(vector: PlaneVector) {
  return { x: xPosition(vector.value[0]), y: yPosition(vector.value[1]) };
}

const origin = computed(() => ({ x: xPosition(0), y: yPosition(0) }));

function markerId(tone: Tone = "neutral") {
  return `${instanceId}-arrow-${tone}`;
}

function markerUrl(tone: Tone = "neutral") {
  return `url(#${markerId(tone)})`;
}

function componentId(vector: PlaneVector, axis: "x" | "y") {
  return `${vector.id}:${axis}`;
}

function markState(id: string): MarkState {
  if (viewMode.value === "static" || reducedMotion.value) return "overview";
  if (current.value?.active.includes(id)) return "current";
  if (steps.value.slice(0, currentStep.value).some((step) => step.active.includes(id))) return "complete";
  return "future";
}

function anglePath() {
  if (scene.value.vectors.length < 2) return "";
  const [first, second] = scene.value.vectors;
  const angles = [
    Math.atan2(first.value[1], first.value[0]),
    Math.atan2(second.value[1], second.value[0])
  ].sort((left, right) => left - right);
  const radius = 43;
  const start = {
    x: origin.value.x + radius * Math.cos(angles[0]),
    y: origin.value.y - radius * Math.sin(angles[0])
  };
  const end = {
    x: origin.value.x + radius * Math.cos(angles[1]),
    y: origin.value.y - radius * Math.sin(angles[1])
  };
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 0 ${end.x} ${end.y}`;
}

function angleLabelPosition() {
  if (scene.value.vectors.length < 2) return origin.value;
  const angles = scene.value.vectors.map((vector) => Math.atan2(vector.value[1], vector.value[0]));
  const middle = (Math.min(...angles) + Math.max(...angles)) / 2;
  const radius = 61;
  return {
    x: origin.value.x + radius * Math.cos(middle),
    y: origin.value.y - radius * Math.sin(middle)
  };
}

function stop() {
  playing.value = false;
  if (timer) clearInterval(timer);
  timer = undefined;
}

function scheduleAutoPlay() {
  if (
    hasAutoStarted ||
    !stageInView ||
    reducedMotion.value ||
    viewMode.value === "static" ||
    steps.value.length < 2
  ) return;
  if (autoStartTimer) clearTimeout(autoStartTimer);
  autoStartTimer = setTimeout(() => {
    autoStartTimer = undefined;
    if (!stageInView || hasAutoStarted) return;
    play(true);
  }, 520);
}

function play(automatic = false) {
  if (viewMode.value === "static" || reducedMotion.value || steps.value.length < 2) return;
  if (!automatic) {
    hasAutoStarted = true;
    pausedByVisibility = false;
  } else if (!hasAutoStarted) {
    hasAutoStarted = true;
  }
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
  hasAutoStarted = true;
  pausedByVisibility = false;
  stop();
  currentStep.value = Math.max(0, currentStep.value - 1);
}

function next() {
  hasAutoStarted = true;
  pausedByVisibility = false;
  stop();
  currentStep.value = Math.min(steps.value.length - 1, currentStep.value + 1);
}

function setMode(mode: "motion" | "static") {
  hasAutoStarted = true;
  pausedByVisibility = false;
  stop();
  viewMode.value = mode;
}

function handleMotionPreference(event: MediaQueryListEvent | MediaQueryList) {
  reducedMotion.value = event.matches;
  if (event.matches) {
    stop();
    viewMode.value = "static";
  }
}

onMounted(() => {
  motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  handleMotionPreference(motionPreference);
  motionPreference.addEventListener("change", handleMotionPreference);
  intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      stageInView = Boolean(entry?.isIntersecting);
      if (!stageInView) {
        if (autoStartTimer) clearTimeout(autoStartTimer);
        autoStartTimer = undefined;
        if (playing.value) {
          pausedByVisibility = true;
          stop();
        }
        return;
      }
      if (pausedByVisibility && currentStep.value < steps.value.length - 1) {
        pausedByVisibility = false;
        play(true);
        return;
      }
      scheduleAutoPlay();
    },
    { threshold: 0.35 }
  );
  if (figureElement.value) intersectionObserver.observe(figureElement.value);
});

onBeforeUnmount(() => {
  stop();
  if (autoStartTimer) clearTimeout(autoStartTimer);
  intersectionObserver?.disconnect();
  motionPreference?.removeEventListener("change", handleMotionPreference);
});
</script>

<template>
  <figure ref="figureElement" class="pencil-visual pencil-formula-plane">
    <PencilLearningIntent :learning-goal="scene.learningGoal" :watch-for="scene.watchFor" />

    <div class="pencil-controls" role="group" aria-label="公式几何图显示控制">
      <div class="pencil-segmented" role="group" aria-label="显示模式">
        <button type="button" :aria-pressed="viewMode === 'motion'" @click="setMode('motion')">逐步讲解</button>
        <button type="button" :aria-pressed="viewMode === 'static'" @click="setMode('static')">关系总览</button>
      </div>
      <div class="pencil-step-controls">
        <button type="button" aria-label="上一步" title="上一步" :disabled="viewMode === 'static' || currentStep === 0" @click="previous">←</button>
        <button type="button" :aria-label="playing ? '暂停' : '播放'" :title="reducedMotion ? '系统已减少动态效果，可使用前后步骤按钮' : playing ? '暂停' : '播放'" :disabled="viewMode === 'static' || reducedMotion" @click="play()">{{ playing ? "Ⅱ" : "▶" }}</button>
        <button type="button" aria-label="下一步" title="下一步" :disabled="viewMode === 'static' || currentStep >= steps.length - 1" @click="next">→</button>
      </div>
    </div>

    <div class="pencil-formula-stage" role="img" :aria-label="stageDescription">
      <svg viewBox="0 0 430 310" aria-hidden="true">
        <defs>
          <marker
            v-for="tone in tones"
            :id="markerId(tone)"
            :key="tone"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M 0 0 L 7 3.5 L 0 7 z" :class="`tone-fill-${tone}`" />
          </marker>
        </defs>

        <g class="pencil-formula-grid" :class="`state-${markState('axes')}`">
          <line
            v-for="tick in xTicks"
            :key="`x-grid-${tick}`"
            :x1="xPosition(tick)"
            :x2="xPosition(tick)"
            :y1="plot.top"
            :y2="plot.top + plot.height"
          />
          <line
            v-for="tick in yTicks"
            :key="`y-grid-${tick}`"
            :x1="plot.left"
            :x2="plot.left + plot.width"
            :y1="yPosition(tick)"
            :y2="yPosition(tick)"
          />
        </g>

        <g class="pencil-formula-axes" :class="`state-${markState('axes')}`">
          <line :x1="plot.left" :x2="plot.left + plot.width + 8" :y1="origin.y" :y2="origin.y" />
          <line :x1="origin.x" :x2="origin.x" :y1="plot.top + plot.height" :y2="plot.top - 8" />
          <text :x="plot.left + plot.width + 10" :y="origin.y + 5">{{ scene.axes.xLabel }}</text>
          <text :x="origin.x + 8" :y="plot.top - 8">{{ scene.axes.yLabel }}</text>
          <text :x="origin.x - 13" :y="origin.y + 18">0</text>
          <text v-for="tick in xTicks.filter((value) => value !== 0)" :key="`x-tick-${tick}`" :x="xPosition(tick)" :y="origin.y + 18" text-anchor="middle">{{ tick }}</text>
          <text v-for="tick in yTicks.filter((value) => value !== 0)" :key="`y-tick-${tick}`" :x="origin.x - 11" :y="yPosition(tick) + 4" text-anchor="end">{{ tick }}</text>
        </g>

        <g
          v-for="vector in scene.vectors"
          :key="`${vector.id}-x-component`"
          class="pencil-formula-component"
          :class="[`tone-${vector.tone ?? 'neutral'}`, `state-${markState(componentId(vector, 'x'))}`]"
        >
          <line :x1="origin.x" :x2="vectorPoint(vector).x" :y1="origin.y" :y2="origin.y" />
          <text :x="(origin.x + vectorPoint(vector).x) / 2" :y="origin.y + (vector.id === scene.vectors[0]?.id ? 34 : 50)" text-anchor="middle">{{ vector.label }}ₓ = {{ vector.value[0] }}</text>
        </g>

        <g
          v-for="vector in scene.vectors"
          :key="`${vector.id}-y-component`"
          class="pencil-formula-component"
          :class="[`tone-${vector.tone ?? 'neutral'}`, `state-${markState(componentId(vector, 'y'))}`]"
        >
          <line :x1="vectorPoint(vector).x" :x2="vectorPoint(vector).x" :y1="origin.y" :y2="vectorPoint(vector).y" />
          <text :x="vectorPoint(vector).x + 8" :y="(origin.y + vectorPoint(vector).y) / 2">{{ vector.label }}ᵧ = {{ vector.value[1] }}</text>
        </g>

        <g
          v-for="vector in scene.vectors"
          :key="vector.id"
          class="pencil-formula-vector"
          :class="[`tone-${vector.tone ?? 'neutral'}`, `state-${markState(vector.id)}`]"
        >
          <line
            :x1="origin.x"
            :y1="origin.y"
            :x2="vectorPoint(vector).x"
            :y2="vectorPoint(vector).y"
            :marker-end="markerUrl(vector.tone ?? 'neutral')"
          />
          <circle :cx="vectorPoint(vector).x" :cy="vectorPoint(vector).y" r="4" />
          <text :x="vectorPoint(vector).x + 10" :y="vectorPoint(vector).y - 10">{{ vector.label }} = [{{ vector.value.join(", ") }}]</text>
        </g>

        <g v-if="scene.angleLabel" class="pencil-formula-angle" :class="`state-${markState('angle')}`">
          <path :d="anglePath()" />
          <text :x="angleLabelPosition().x" :y="angleLabelPosition().y">{{ scene.angleLabel }}</text>
        </g>
      </svg>

      <section class="pencil-formula-reading" aria-live="polite" aria-atomic="true">
        <p class="pencil-formula-focus">{{ viewMode === "static" ? scene.watchFor : current?.focus }}</p>
        <strong class="pencil-formula-expression">{{ expression }}</strong>
        <div class="pencil-formula-links" role="list">
          <div
            v-for="link in scene.links"
            :key="link.id"
            role="listitem"
            class="pencil-formula-link"
            :class="[`tone-${link.tone ?? 'neutral'}`, `state-${markState(link.id)}`]"
          >
            <span>{{ link.label }}</span>
            <i aria-hidden="true" />
            <strong>{{ link.expression }}</strong>
          </div>
        </div>
        <p class="pencil-formula-annotation">{{ annotation }}</p>
      </section>
    </div>

    <p class="pencil-formula-boundary"><strong>读图边界</strong>{{ scene.boundary }}</p>

    <PencilStepExplanation
      :steps="steps"
      :current-step="currentStep"
      :view-mode="viewMode"
      :overview="scene.summaryNote"
    />
  </figure>
</template>
