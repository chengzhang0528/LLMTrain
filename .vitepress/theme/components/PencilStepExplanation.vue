<script setup lang="ts">
import { computed } from "vue";

type PencilLearningStep = {
  title: string;
  methodKind?: string;
  method?: string;
  purpose: string;
  detail: string;
  watch: string;
  reflection: string;
};

const props = withDefaults(
  defineProps<{
    steps: PencilLearningStep[];
    currentStep: number;
    viewMode: "motion" | "static";
    overview?: string;
    variant?: "full" | "supplement";
  }>(),
  { overview: "", variant: "full" }
);

const current = computed(() => props.steps[props.currentStep]);
</script>

<template>
  <component
    :is="variant === 'supplement' ? 'div' : 'figcaption'"
    class="pencil-step-explanation"
    :class="[`is-${viewMode}`, `is-${variant}`]"
    :aria-live="variant === 'supplement' ? undefined : 'polite'"
  >
    <template v-if="viewMode === 'motion' && current">
      <div v-if="variant === 'full'" class="pencil-step-heading">
        <span>第 {{ currentStep + 1 }} / {{ steps.length }} 步</span>
        <strong>{{ current.title }}</strong>
        <small v-if="current.method">{{ current.methodKind }}：{{ current.method }}</small>
      </div>
      <dl class="pencil-step-details">
        <div v-if="variant === 'full'">
          <dt>本步只看</dt>
          <dd>{{ current.watch }}</dd>
        </div>
        <div>
          <dt>它的作用</dt>
          <dd>{{ current.purpose }}</dd>
        </div>
        <div>
          <dt>关键理解</dt>
          <dd>{{ current.detail }}</dd>
        </div>
        <div class="pencil-step-reflection">
          <dt>停一下想</dt>
          <dd>{{ current.reflection }}</dd>
        </div>
      </dl>
    </template>

    <template v-else>
      <div v-if="variant === 'full'" class="pencil-step-heading">
        <strong>流程总览</strong>
      </div>
      <p v-if="variant === 'full' && overview" class="pencil-overview-intro">{{ overview }}</p>
      <ol class="pencil-overview-list">
        <li v-for="(step, index) in steps" :key="step.title">
          <span>{{ index + 1 }}</span>
          <div>
            <strong>{{ step.title }}</strong>
            <small v-if="step.method">{{ step.methodKind }}：{{ step.method }}</small>
            <p>{{ step.purpose }}</p>
          </div>
        </li>
      </ol>
    </template>
  </component>
</template>
