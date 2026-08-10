<script setup lang="ts">
defineProps<{
  learningGoal: string;
  watchFor: string;
}>();
</script>

<template>
  <aside class="pencil-learning-intent" aria-label="本图学习目标与观察重点">
    <div>
      <strong>学习目标</strong>
      <p>{{ learningGoal }}</p>
    </div>
    <div>
      <strong>重点看</strong>
      <p>{{ watchFor }}</p>
    </div>
  </aside>
</template>
