<script setup lang="ts">
import { computed } from "vue";

type BenchmarkBar = {
  label: string;
  value: number;
  display?: string;
  note?: string;
  tone?: "brand" | "blue" | "orange" | "danger" | "muted";
  status?: string;
};

type BenchmarkChartSpec = {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  unit?: string;
  max: number;
  ticks?: number[];
  lowerIsBetter?: boolean;
  bars: BenchmarkBar[];
  footnote?: string;
  source?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  updated?: string;
  credibility?: string;
};

const props = defineProps<{ spec: string }>();
const chart = computed<BenchmarkChartSpec>(() => JSON.parse(decodeURIComponent(props.spec)));

const ticks = computed(() => chart.value.ticks ?? [0, chart.value.max / 4, chart.value.max / 2, chart.value.max * 0.75, chart.value.max]);

function width(value: number) {
  const max = chart.value.max || 1;
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
}

function formatTick(value: number) {
  if (Number.isInteger(value)) return `${value}${chart.value.unit ?? ""}`;
  return `${value.toFixed(1)}${chart.value.unit ?? ""}`;
}
</script>

<template>
  <section class="benchmark-chart" :aria-label="chart.ariaLabel">
    <header class="benchmark-chart-header">
      <p class="benchmark-chart-eyebrow">{{ chart.eyebrow }}</p>
      <h2>{{ chart.title }}</h2>
      <p class="benchmark-chart-subtitle">{{ chart.subtitle }}</p>
      <p v-if="chart.updated || chart.credibility" class="benchmark-chart-meta">
        <span v-if="chart.updated">快照 {{ chart.updated }}</span>
        <span v-if="chart.credibility">可信度 {{ chart.credibility }}</span>
      </p>
    </header>

    <div class="benchmark-chart-plot">
      <div class="benchmark-chart-axis" aria-hidden="true">
        <span v-for="tick in ticks" :key="tick" :style="{ left: width(tick) }">{{ formatTick(tick) }}</span>
      </div>
      <div class="benchmark-chart-bars" role="list">
        <article
          v-for="bar in chart.bars"
          :key="bar.label"
          class="benchmark-chart-row"
          :class="[`tone-${bar.tone ?? 'brand'}`, { 'is-status': bar.status }]"
          role="listitem"
          :aria-label="`${bar.label}: ${bar.display ?? `${bar.value}${chart.unit ?? ''}`}${bar.note ? `，${bar.note}` : ''}`"
        >
          <div class="benchmark-chart-label">
            <strong>{{ bar.label }}</strong>
            <span v-if="bar.note">{{ bar.note }}</span>
          </div>
          <div class="benchmark-chart-track" aria-hidden="true">
            <span class="benchmark-chart-bar" :style="{ width: width(bar.value) }"></span>
          </div>
          <div class="benchmark-chart-value">
            <strong>{{ bar.display ?? `${bar.value}${chart.unit ?? ''}` }}</strong>
            <span v-if="bar.status">{{ bar.status }}</span>
          </div>
        </article>
      </div>
    </div>

    <footer v-if="chart.footnote || chart.source" class="benchmark-chart-footer">
      <p v-if="chart.footnote">{{ chart.footnote }}</p>
      <p v-if="chart.source" class="benchmark-chart-source">
        <span>{{ chart.source }}</span>
        <a v-if="chart.sourceUrl" :href="chart.sourceUrl" target="_blank" rel="noreferrer">
          {{ chart.sourceLabel ?? "打开官方榜单" }} ↗
        </a>
      </p>
    </footer>
  </section>
</template>
