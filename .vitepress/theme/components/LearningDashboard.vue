<script setup lang="ts">
import { computed, onMounted } from "vue";
import { withBase } from "vitepress";
import { courseLessons } from "../../course-data.mjs";
import { initializeProgress, useCourseProgress } from "../progress";

const progress = useCourseProgress();
const theoryLessons = courseLessons.filter((lesson) => lesson.phase === "理论");
const caseLessons = courseLessons.filter((lesson) => lesson.phase === "案例");
const resumeUnit = computed(() => {
  const last = progress.lastSessionUnit.value;
  if (last && progress.getReadingStatus(last.source) === "in-progress") return last;
  return null;
});
const continueUnit = computed(() => resumeUnit.value ?? progress.nextRecommendedUnit());
const continuePosition = computed(() =>
  resumeUnit.value ? progress.getUnitProgress(resumeUnit.value.source)?.position : undefined
);
const recommendedConcept = computed(() => progress.nextRecommendedConcept());
const continueLabel = computed(() => {
  if (resumeUnit.value) return "继续学习";
  if (continueUnit.value) return "推荐下一步";
  return "学习进度";
});
const continueAction = computed(() => {
  if (resumeUnit.value) return "回到上次位置";
  if (progress.dueReviewExercises.value.length) return "开始复习这道题";
  if (recommendedConcept.value) return "开始补救这道题";
  if (!continueUnit.value) return "查看学科地图";
  return "开始这一步";
});
const foundationCompleted = computed(() =>
  courseLessons.filter((lesson) => progress.getReadingStatus(lesson.source) === "completed").length
);
const foundationPercent = computed(() =>
  Math.round((foundationCompleted.value / courseLessons.length) * 100)
);

function continueHref() {
  if (!continueUnit.value) return withBase("/00-从这里开始/学科地图");
  if (resumeUnit.value) {
    return withBase(`${resumeUnit.value.href}${resumeUnit.value.href.includes("?") ? "&" : "?"}resume=1`);
  }
  const dueRecord = progress.dueReviewExercises.value[0];
  if (dueRecord) {
    return withBase(`${dueRecord.href}?review=${encodeURIComponent(dueRecord.id)}#${dueRecord.anchor}`);
  }
  const concept = recommendedConcept.value?.concept;
  if (concept) {
    return withBase(`${concept.href}?review=${encodeURIComponent(concept.exerciseId)}#${concept.anchor}`);
  }
  return withBase(continueUnit.value.href);
}

function statusLabel(source: string) {
  const reading = progress.getReadingStatus(source);
  const mastery = progress.getMasteryState(source);
  if (reading === "skipped") return "已跳过";
  if (reading === "completed" && mastery === "needs-review") return "已读·复习";
  if (reading === "completed" && mastery === "mastered") return "已读·掌握";
  if (mastery === "needs-review") return "待复习";
  if (mastery === "mastered") return "已掌握";
  if (reading === "completed") return "已读完";
  if (reading === "in-progress" || mastery === "practicing") return "学习中";
  return "未开始";
}

onMounted(initializeProgress);
</script>

<template>
  <section class="learning-dashboard" aria-labelledby="learning-progress-title">
    <div class="dashboard-heading">
      <div>
        <p class="dashboard-kicker">{{ continueLabel }}</p>
        <h2 id="learning-progress-title">{{ continueUnit?.title || "当前课程单元均已完成或跳过" }}</h2>
        <p class="dashboard-position">
          {{ continuePosition?.heading || continueUnit?.track || "可回看知识结构，或从复习队列继续巩固。" }}
        </p>
      </div>
      <a class="continue-link" :href="continueHref()">{{ continueAction }}</a>
    </div>

    <div class="dashboard-review-row">
      <span>基础闭环 {{ foundationCompleted }} / {{ courseLessons.length }}</span>
      <a :href="withBase('/00-从这里开始/学习记录与复习')">
        {{ progress.needsReviewExercises.value.length }} 道待复习 · 查看学习记录
      </a>
    </div>

    <div
      class="progress-track"
      role="progressbar"
      aria-label="基础闭环完成度"
      :aria-valuenow="foundationPercent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span :style="{ width: `${foundationPercent}%` }" />
    </div>

    <div class="dashboard-columns">
      <section aria-labelledby="theory-progress-title">
        <h3 id="theory-progress-title">理论基础</h3>
        <ol class="lesson-list">
          <li v-for="lesson in theoryLessons" :key="lesson.source">
            <a :href="withBase(lesson.href)">
              <span class="list-day">{{ String(lesson.day).padStart(2, "0") }}</span>
              <span>{{ lesson.title }}</span>
              <span :class="[`list-status`, `state-${progress.getDisplayState(lesson.source)}`]">
                {{ statusLabel(lesson.source) }}
              </span>
            </a>
          </li>
        </ol>
      </section>

      <section aria-labelledby="case-progress-title">
        <h3 id="case-progress-title">训练过程案例</h3>
        <ol class="lesson-list">
          <li v-for="lesson in caseLessons" :key="lesson.source">
            <a :href="withBase(lesson.href)">
              <span class="list-day">{{ lesson.day }}</span>
              <span>{{ lesson.title }}</span>
              <span :class="[`list-status`, `state-${progress.getDisplayState(lesson.source)}`]">
                {{ statusLabel(lesson.source) }}
              </span>
            </a>
          </li>
        </ol>
      </section>
    </div>
  </section>
</template>
