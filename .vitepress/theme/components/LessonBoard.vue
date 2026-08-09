<script setup lang="ts">
import { computed } from "vue";

type BoardRow = { label: string; value: string; tone?: string };
type BoardStep = { number?: string; title: string; text: string; tone?: string };
type CompareTable = { headers: string[]; rows: Array<{ label: string; values: string[] }> };
type BoardCallout = { label: string; text: string; tone?: string };
type BoardPanel = {
  id: string;
  label: string;
  title: string;
  subtitle?: string;
  tone?: string;
  span?: number;
  rows?: BoardRow[];
  steps?: BoardStep[];
  compare?: CompareTable;
  callout?: BoardCallout;
};
type BoardTakeaway = { number: string; title: string; text: string; tone?: string };
type BoardSpec = {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  panels: BoardPanel[];
  takeaways: BoardTakeaway[];
  conclusion: string;
  footer?: string;
};

const props = defineProps<{ spec: string }>();
const board = computed<BoardSpec>(() => JSON.parse(decodeURIComponent(props.spec)));

function panelStyle(panel: BoardPanel) {
  return { "--board-span": String(panel.span ?? 4) };
}

function compareStyle(panel: BoardPanel) {
  return { "--board-value-columns": String(Math.max((panel.compare?.headers.length ?? 2) - 1, 1)) };
}
</script>

<template>
  <section class="lesson-board" :aria-label="board.ariaLabel">
    <header class="lesson-board-header">
      <p class="lesson-board-eyebrow">{{ board.eyebrow }}</p>
      <h2>{{ board.title }}</h2>
      <p class="lesson-board-subtitle">{{ board.subtitle }}</p>
    </header>

    <div class="lesson-board-panels">
      <article
        v-for="panel in board.panels"
        :key="panel.id"
        class="lesson-board-panel"
        :class="[{ 'is-full': (panel.span ?? 4) === 12 }, `tone-${panel.tone ?? 'blue'}`]"
        :style="panelStyle(panel)"
      >
        <header class="lesson-board-panel-header">
          <span class="lesson-board-panel-label">{{ panel.label }}</span>
          <div>
            <h3>{{ panel.title }}</h3>
            <p v-if="panel.subtitle">{{ panel.subtitle }}</p>
          </div>
        </header>

        <div v-if="panel.steps?.length" class="lesson-board-steps">
          <template v-for="(step, index) in panel.steps" :key="`${panel.id}-${step.title}`">
            <div class="lesson-board-step" :class="[`tone-${step.tone ?? panel.tone ?? 'blue'}`]">
              <span class="lesson-board-step-number">{{ step.number ?? String(index + 1).padStart(2, "0") }}</span>
              <strong>{{ step.title }}</strong>
              <span>{{ step.text }}</span>
            </div>
            <span v-if="index < panel.steps.length - 1" class="lesson-board-step-arrow" aria-hidden="true">↓</span>
          </template>
        </div>

        <dl v-if="panel.rows?.length" class="lesson-board-rows">
          <template v-for="row in panel.rows" :key="`${panel.id}-${row.label}`">
            <dt>{{ row.label }}</dt>
            <dd :class="[`tone-${row.tone ?? panel.tone ?? 'blue'}`]">{{ row.value }}</dd>
          </template>
        </dl>

        <div v-if="panel.compare" class="lesson-board-compare" :style="compareStyle(panel)" role="table">
          <div class="lesson-board-compare-row lesson-board-compare-head" role="row">
            <strong role="columnheader">{{ panel.compare.headers[0] }}</strong>
            <strong v-for="header in panel.compare.headers.slice(1)" :key="header" role="columnheader">{{ header }}</strong>
          </div>
          <div v-for="row in panel.compare.rows" :key="`${panel.id}-${row.label}`" class="lesson-board-compare-row" role="row">
            <strong role="rowheader">{{ row.label }}</strong>
            <span v-for="(value, index) in row.values" :key="`${row.label}-${index}`" role="cell">{{ value }}</span>
          </div>
        </div>

        <aside v-if="panel.callout" class="lesson-board-callout" :class="[`tone-${panel.callout.tone ?? panel.tone ?? 'orange'}`]">
          <strong>{{ panel.callout.label }}</strong>
          <span>{{ panel.callout.text }}</span>
        </aside>
      </article>
    </div>

    <footer class="lesson-board-footer">
      <div class="lesson-board-takeaways">
        <article v-for="item in board.takeaways" :key="item.number" class="lesson-board-takeaway" :class="[`tone-${item.tone ?? 'blue'}`]">
          <span class="lesson-board-takeaway-number">{{ item.number }}</span>
          <strong>{{ item.title }}</strong>
          <span>{{ item.text }}</span>
        </article>
      </div>
      <p class="lesson-board-conclusion">{{ board.conclusion }}</p>
      <p v-if="board.footer" class="lesson-board-footnote">{{ board.footer }}</p>
    </footer>
  </section>
</template>
