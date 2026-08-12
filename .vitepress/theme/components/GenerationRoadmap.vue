<script setup lang="ts">
import { computed } from "vue";

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
    };
    decision: {
      label: string;
      action: string;
      stop: string;
      continue: string;
    };
    label: string;
    detail: string;
  };
  boundary: string;
};

const props = defineProps<{ spec: string }>();
const roadmap = computed<RoadmapSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
</script>

<template>
  <figure class="generation-roadmap" :aria-label="roadmap.ariaLabel">
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
      <div class="generation-roadmap-loop-note">
        <span aria-hidden="true">↩</span>
        <div>
          <strong>{{ roadmap.loop.label }}</strong>
          <p>{{ roadmap.loop.detail }}</p>
        </div>
      </div>
    </div>

    <p class="generation-roadmap-boundary"><strong>适用边界</strong>{{ roadmap.boundary }}</p>
  </figure>
</template>
