<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useData } from "vitepress";
import { courseLessons } from "../../course-data.mjs";
import { initializeProgress, useCourseProgress } from "../progress";

const { page } = useData();
const progress = useCourseProgress();
const lesson = computed(() =>
  courseLessons.find((item) => item.source === page.value.relativePath)
);

function recordVisit() {
  if (lesson.value) progress.markVisited(lesson.value.source);
}

onMounted(() => {
  initializeProgress();
  recordVisit();
});

watch(() => page.value.relativePath, recordVisit);
</script>

<template>
  <div v-if="lesson" class="lesson-toolbar" :class="{ complete: progress.isCompleted(lesson.source) }">
    <div class="lesson-identity">
      <span class="lesson-day">D{{ String(lesson.day).padStart(2, "0") }}</span>
      <span class="lesson-phase">{{ lesson.phase }}</span>
    </div>
    <button
      type="button"
      class="lesson-complete-button"
      :aria-pressed="progress.isCompleted(lesson.source)"
      @click="progress.toggleCompleted(lesson.source)"
    >
      {{ progress.isCompleted(lesson.source) ? "已完成" : "标记完成" }}
    </button>
  </div>
</template>
