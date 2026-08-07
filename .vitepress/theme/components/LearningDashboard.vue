<script setup lang="ts">
import { computed, onMounted } from "vue";
import { withBase } from "vitepress";
import { courseLessons } from "../../course-data.mjs";
import { initializeProgress, useCourseProgress } from "../progress";

const progress = useCourseProgress();
const theoryLessons = courseLessons.slice(0, 14);
const practiceLessons = courseLessons.slice(14);
const nextLesson = computed(() => {
  const last = courseLessons.find(
    (lesson) =>
      lesson.source === progress.lastVisitedSource.value &&
      !progress.isCompleted(lesson.source)
  );
  return last ?? courseLessons.find((lesson) => !progress.isCompleted(lesson.source)) ?? courseLessons[0];
});

function reset() {
  if (window.confirm("确认清空全部 21 天学习进度？")) {
    progress.resetProgress();
  }
}

onMounted(initializeProgress);
</script>

<template>
  <section class="learning-dashboard" aria-labelledby="learning-progress-title">
    <div class="dashboard-heading">
      <div>
        <p class="dashboard-kicker">21 天学习进度</p>
        <h2 id="learning-progress-title">
          {{ progress.completedCount.value }} / {{ courseLessons.length }} 已完成
        </h2>
      </div>
      <a class="continue-link" :href="withBase(nextLesson.href)">
        继续 D{{ String(nextLesson.day).padStart(2, "0") }}
      </a>
    </div>

    <div
      class="progress-track"
      role="progressbar"
      aria-label="课程完成度"
      :aria-valuenow="progress.percent.value"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span :style="{ width: `${progress.percent.value}%` }" />
    </div>

    <div class="dashboard-columns">
      <section aria-labelledby="theory-progress-title">
        <h3 id="theory-progress-title">理论 · D01-D14</h3>
        <ol class="lesson-list">
          <li v-for="lesson in theoryLessons" :key="lesson.source">
            <a :href="withBase(lesson.href)">
              <span class="list-day">{{ String(lesson.day).padStart(2, "0") }}</span>
              <span>{{ lesson.title }}</span>
              <span class="list-status" :class="{ done: progress.isCompleted(lesson.source) }">
                {{ progress.isCompleted(lesson.source) ? "完成" : "未完成" }}
              </span>
            </a>
          </li>
        </ol>
      </section>

      <section aria-labelledby="practice-progress-title">
        <h3 id="practice-progress-title">实践 · D15-D21</h3>
        <ol class="lesson-list">
          <li v-for="lesson in practiceLessons" :key="lesson.source">
            <a :href="withBase(lesson.href)">
              <span class="list-day">{{ lesson.day }}</span>
              <span>{{ lesson.title }}</span>
              <span class="list-status" :class="{ done: progress.isCompleted(lesson.source) }">
                {{ progress.isCompleted(lesson.source) ? "完成" : "未完成" }}
              </span>
            </a>
          </li>
        </ol>
      </section>
    </div>

    <div class="dashboard-actions">
      <span>{{ progress.percent.value }}%</span>
      <button v-if="progress.completedCount.value" type="button" @click="reset">
        重置进度
      </button>
    </div>
  </section>
</template>
