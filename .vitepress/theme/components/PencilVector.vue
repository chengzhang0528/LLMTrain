<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import PencilLearningIntent from "./PencilLearningIntent.vue";
import PencilStepExplanation from "./PencilStepExplanation.vue";

type VectorStep = {
  title: string;
  purpose: string;
  detail: string;
  watch: string;
  reflection: string;
  active: number[];
  focus?: number;
  expression: string;
  annotation: string;
};

type VectorSpec = {
  ariaLabel: string;
  learningGoal: string;
  watchFor: string;
  mode?: "animated" | "static";
  showPythonIndex?: boolean;
  vectorName: string;
  values: number[];
  summary: string;
  summaryNote: string;
  steps: VectorStep[];
};

const props = defineProps<{ spec: string }>();
const scene = computed<VectorSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const figureElement = ref<HTMLElement | null>(null);
const steps = computed(() => scene.value.steps ?? []);
const currentStep = ref(0);
const viewMode = ref<"motion" | "static">(scene.value.mode === "static" ? "static" : "motion");
const playing = ref(false);
const reduceMotion = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let autoStartTimer: ReturnType<typeof setTimeout> | undefined;
let motionQuery: MediaQueryList | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let hasAutoStarted = false;
let stageInView = false;
let pausedByVisibility = false;

const current = computed(() => steps.value[currentStep.value]);
const showPythonIndex = computed(() => scene.value.showPythonIndex === true);
const activeIndices = computed(() => new Set(current.value?.active ?? []));
const expression = computed(() =>
  viewMode.value === "static" ? scene.value.summary : current.value?.expression ?? scene.value.summary
);
const annotation = computed(() =>
  viewMode.value === "static" ? scene.value.summaryNote : current.value?.annotation ?? scene.value.summaryNote
);
const stageDescription = computed(() =>
  viewMode.value === "static"
    ? scene.value.ariaLabel
    : `${current.value?.title ?? "向量"}。${expression.value}。${annotation.value}`
);

function cellIsActive(index: number) {
  return viewMode.value === "static" || activeIndices.value.has(index + 1);
}

function cellIsFocused(index: number) {
  return viewMode.value === "motion" && current.value?.focus === index + 1;
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
    reduceMotion.value ||
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
  if (reduceMotion.value || viewMode.value === "static" || steps.value.length < 2) return;
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
  }, 5200);
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

function syncMotionPreference(event: MediaQueryListEvent | MediaQueryList) {
  reduceMotion.value = event.matches;
  if (event.matches) stop();
}

onMounted(() => {
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  syncMotionPreference(motionQuery);
  if (reduceMotion.value) viewMode.value = "static";
  motionQuery.addEventListener("change", syncMotionPreference);
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
  motionQuery?.removeEventListener("change", syncMotionPreference);
});
</script>

<template>
  <figure ref="figureElement" class="pencil-visual pencil-vector">
    <PencilLearningIntent :learning-goal="scene.learningGoal" :watch-for="scene.watchFor" />

    <div class="pencil-controls" aria-label="向量图显示控制">
      <div class="pencil-segmented" aria-label="显示模式">
        <button type="button" :aria-pressed="viewMode === 'motion'" @click="setMode('motion')">逐步讲解</button>
        <button type="button" :aria-pressed="viewMode === 'static'" @click="setMode('static')">流程总览</button>
      </div>
      <div class="pencil-step-controls">
        <button type="button" aria-label="上一步" title="上一步" :disabled="viewMode === 'static' || currentStep === 0" @click="previous">←</button>
        <button
          type="button"
          :aria-label="playing ? '暂停' : '播放'"
          :title="reduceMotion ? '系统已减少动态效果，可使用前后步骤按钮' : playing ? '暂停' : '播放'"
          :disabled="viewMode === 'static' || reduceMotion"
          @click="play()"
        >
          {{ playing ? "Ⅱ" : "▶" }}
        </button>
        <button type="button" aria-label="下一步" title="下一步" :disabled="viewMode === 'static' || currentStep >= steps.length - 1" @click="next">→</button>
      </div>
    </div>

    <div class="pencil-vector-stage" role="img" :aria-label="stageDescription">
      <div class="pencil-vector-dimension">
        <strong>{{ scene.vectorName }}</strong>
        <span>{{ scene.values.length }} 个数字 = {{ scene.values.length }} 维</span>
      </div>

      <div class="pencil-vector-row is-math-index">
        <span class="pencil-vector-row-label">数学下标</span>
        <div class="pencil-vector-cells" :style="{ gridTemplateColumns: `repeat(${scene.values.length}, minmax(0, 1fr))` }">
          <span
            v-for="(_, index) in scene.values"
            :key="`math-${index}`"
            :class="{ active: cellIsActive(index), focus: cellIsFocused(index) }"
          >{{ index + 1 }}</span>
        </div>
      </div>

      <div class="pencil-vector-row is-values">
        <span class="pencil-vector-row-label">{{ scene.vectorName }}</span>
        <div class="pencil-vector-cells" :style="{ gridTemplateColumns: `repeat(${scene.values.length}, minmax(0, 1fr))` }">
          <strong
            v-for="(value, index) in scene.values"
            :key="`value-${index}`"
            :class="{ active: cellIsActive(index), focus: cellIsFocused(index), zero: value === 0 }"
          >{{ value }}</strong>
        </div>
      </div>

      <div v-if="showPythonIndex" class="pencil-vector-row is-code-index">
        <span class="pencil-vector-row-label">Python 索引</span>
        <div class="pencil-vector-cells" :style="{ gridTemplateColumns: `repeat(${scene.values.length}, minmax(0, 1fr))` }">
          <span
            v-for="(_, index) in scene.values"
            :key="`code-${index}`"
            :class="{ active: cellIsActive(index), focus: cellIsFocused(index) }"
          >{{ index }}</span>
        </div>
      </div>

      <div class="pencil-vector-result" aria-live="polite">
        <strong>{{ expression }}</strong>
        <span>{{ annotation }}</span>
      </div>
    </div>

    <PencilStepExplanation
      :steps="steps"
      :current-step="currentStep"
      :view-mode="viewMode"
      :overview="scene.ariaLabel"
    />
  </figure>
</template>
