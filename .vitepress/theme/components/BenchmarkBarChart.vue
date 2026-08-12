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

function width(value: number) {
  const max = chart.value.max || 1;
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
}

function rowStyle(bar: BenchmarkBar) {
  return { "--benchmark-score-width": width(bar.value) };
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

    <div class="benchmark-chart-table-wrap">
      <table class="benchmark-chart-table">
        <thead>
          <tr>
            <th scope="col">模型</th>
            <th scope="col">分数</th>
            <th scope="col">条件</th>
            <th scope="col">位置</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="bar in chart.bars"
            :key="bar.label"
            :class="`tone-${bar.tone ?? 'brand'}`"
            :style="rowStyle(bar)"
          >
            <th scope="row">{{ bar.label }}</th>
            <td class="benchmark-chart-score"><strong>{{ bar.display ?? `${bar.value}${chart.unit ?? ''}` }}</strong></td>
            <td>{{ bar.note }}</td>
            <td>{{ bar.status }}</td>
          </tr>
        </tbody>
      </table>
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
