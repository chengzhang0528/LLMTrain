<script setup lang="ts">
import { computed } from "vue";

type BenchmarkTerm = {
  term: string;
  meaning: string;
  tone?: "brand" | "blue" | "orange" | "danger" | "muted";
};

type BenchmarkTermSpec = {
  ariaLabel: string;
  eyebrow?: string;
  title: string;
  terms: BenchmarkTerm[];
};

const props = defineProps<{ spec: string }>();
const strip = computed<BenchmarkTermSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
</script>

<template>
  <section class="benchmark-term-strip" :aria-label="strip.ariaLabel">
    <header class="benchmark-term-strip-header">
      <p v-if="strip.eyebrow" class="benchmark-term-strip-eyebrow">{{ strip.eyebrow }}</p>
      <h2>{{ strip.title }}</h2>
    </header>
    <dl class="benchmark-term-list">
      <div v-for="item in strip.terms" :key="item.term" class="benchmark-term" :class="`tone-${item.tone ?? 'brand'}`">
        <dt>{{ item.term }}</dt>
        <dd>{{ item.meaning }}</dd>
      </div>
    </dl>
  </section>
</template>
