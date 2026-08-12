<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

type RoadmapDetail = {
  label: string;
  value: string;
};

type RoadmapStage = {
  number: string;
  title: string;
  summary: string;
  shape?: string;
  side: "left" | "right";
  details: RoadmapDetail[];
};

type RoadmapSpec = {
  ariaLabel: string;
  learningGoal: string;
  watchFor: string;
  legend: {
    main: string;
    detail: string;
    loop: string;
  };
  stages: RoadmapStage[];
  loop: {
    source: string;
    display: {
      label: string;
      action: string;
      result: string;
      control: string;
    };
    decision: {
      label: string;
      action: string;
      stop: string;
      continue: string;
    };
    decode: {
      label: string;
      action: string;
      shape: string;
      detail: string;
      return: string;
    };
  };
  boundary: string;
};

const props = defineProps<{ spec: string }>();
const roadmap = computed<RoadmapSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const roadmapElement = ref<HTMLElement | null>(null);
const returnPath = ref({ width: 0, height: 0, d: "" });

let resizeObserver: ResizeObserver | undefined;
let resizeFrame = 0;

function updateReturnPath() {
  const root = roadmapElement.value;
  const target = root?.querySelector<HTMLElement>('[data-stage-number="05"] .generation-roadmap-stage');
  const source = root?.querySelector<HTMLElement>(".generation-roadmap-decode-card");
  if (!root || !target || !source) return;

  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const sourceX = sourceRect.left - rootRect.left;
  const sourceY = sourceRect.top - rootRect.top + sourceRect.height / 2;
  const targetY = targetRect.top - rootRect.top + targetRect.height / 2;
  const targetX = targetRect.left - rootRect.left;
  const railX = Math.max(4, Math.min(sourceX, targetX) - 24);

  returnPath.value = {
    width: root.clientWidth,
    height: root.scrollHeight,
    d: `M ${sourceX} ${sourceY} H ${railX} V ${targetY} H ${targetX}`
  };
}

function scheduleReturnPathUpdate() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(updateReturnPath);
}

onMounted(async () => {
  await nextTick();
  scheduleReturnPathUpdate();
  resizeObserver = new ResizeObserver(() => {
    if (!returnPath.value.d) scheduleReturnPathUpdate();
  });
  const target = roadmapElement.value?.querySelector<HTMLElement>('[data-stage-number="05"] .generation-roadmap-stage');
  const source = roadmapElement.value?.querySelector<HTMLElement>(".generation-roadmap-decode-card");
  if (target) resizeObserver.observe(target);
  if (source) resizeObserver.observe(source);
  window.addEventListener("resize", scheduleReturnPathUpdate);
  document.fonts?.ready.then(scheduleReturnPathUpdate);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(resizeFrame);
  resizeObserver?.disconnect();
  window.removeEventListener("resize", scheduleReturnPathUpdate);
});
</script>

<template>
  <figure ref="roadmapElement" class="generation-roadmap" :aria-label="roadmap.ariaLabel">
    <svg
      v-if="returnPath.d"
      class="generation-roadmap-return-line"
      :viewBox="`0 0 ${returnPath.width} ${returnPath.height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker id="generation-roadmap-return-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M 0 0 L 9 4.5 L 0 9 Z" />
        </marker>
      </defs>
      <path :d="returnPath.d" marker-end="url(#generation-roadmap-return-arrow)" />
    </svg>
    <figcaption class="generation-roadmap-header">
      <strong>{{ roadmap.learningGoal }}</strong>
      <span>{{ roadmap.watchFor }}</span>
    </figcaption>

    <div class="generation-roadmap-legend" aria-label="连线图例">
      <span><i class="is-main" aria-hidden="true" />{{ roadmap.legend.main }}</span>
      <span><i class="is-detail" aria-hidden="true" />{{ roadmap.legend.detail }}</span>
      <span><i class="is-loop" aria-hidden="true" />{{ roadmap.legend.loop }}</span>
    </div>

    <ol class="generation-roadmap-list">
      <li
        v-for="stage in roadmap.stages"
        :key="stage.number"
        class="generation-roadmap-row"
        :class="`is-${stage.side}`"
        :data-stage-number="stage.number"
      >
        <article class="generation-roadmap-stage">
          <span>{{ stage.number }}</span>
          <div>
            <h3>{{ stage.title }}</h3>
            <p>{{ stage.summary }}</p>
          </div>
          <code v-if="stage.shape">{{ stage.shape }}</code>
        </article>

        <span class="generation-roadmap-knot" aria-hidden="true" />

        <dl class="generation-roadmap-details">
          <div v-for="detail in stage.details" :key="`${stage.number}-${detail.label}`">
            <dt>{{ detail.label }}</dt>
            <dd>{{ detail.value }}</dd>
          </div>
        </dl>
      </li>
    </ol>

    <div class="generation-roadmap-loop" aria-label="已接受 ID 的两条用途与停止分支">
      <strong class="generation-roadmap-loop-source">{{ roadmap.loop.source }}</strong>
      <div class="generation-roadmap-loop-paths">
        <section class="is-display">
          <span>{{ roadmap.loop.display.label }}</span>
          <strong>{{ roadmap.loop.display.action }}</strong>
          <p>{{ roadmap.loop.display.result }}</p>
        </section>
        <section class="is-decision">
          <span>{{ roadmap.loop.decision.label }}</span>
          <strong>{{ roadmap.loop.decision.action }}</strong>
          <p>{{ roadmap.loop.decision.stop }}</p>
          <p class="is-continue">{{ roadmap.loop.decision.continue }}</p>
        </section>
      </div>
      <p class="generation-roadmap-buffer-control">
        <span>token / 文本缓冲</span>
        <span aria-hidden="true">→</span>
        <strong>{{ roadmap.loop.display.control }}</strong>
      </p>
      <div class="generation-roadmap-decode-flow" aria-label="未停止序列的下一轮 decode 前向与返回路径">
        <article class="generation-roadmap-decode-card">
          <span>{{ roadmap.loop.decode.label }}</span>
          <strong>{{ roadmap.loop.decode.action }}</strong>
          <code>{{ roadmap.loop.decode.shape }}</code>
          <p>{{ roadmap.loop.decode.detail }}</p>
        </article>
        <p class="generation-roadmap-decode-return">
          <span aria-hidden="true">回边</span>
          <strong>{{ roadmap.loop.decode.return }}</strong>
        </p>
      </div>
    </div>

    <p class="generation-roadmap-boundary"><strong>适用边界</strong>{{ roadmap.boundary }}</p>
  </figure>
</template>
