<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { useData } from "vitepress";
import { learningUnits } from "../../course-data.mjs";
import { initializeProgress, useCourseProgress } from "../progress";

const { page } = useData();
const progress = useCourseProgress();
const unit = computed(() =>
  learningUnits.find((item) => item.source === page.value.relativePath)
);
const readingStatus = computed(() =>
  unit.value ? progress.getReadingStatus(unit.value.source) : "unstarted"
);
const masteryState = computed(() =>
  unit.value ? progress.getMasteryState(unit.value.source) : "unassessed"
);
const reviewCount = computed(() =>
  unit.value ? progress.getLessonReviewCount(unit.value.source) : 0
);
const masteryLabel = computed(() => ({
  unassessed: "未检测",
  practicing: "练习中",
  "needs-review": reviewCount.value ? `待复习 ${reviewCount.value}` : "待复习",
  mastered: "已掌握"
}[masteryState.value]));
const readingLabel = computed(() => ({
  unstarted: "未开始",
  "in-progress": "学习中",
  completed: "已读完",
  skipped: "已跳过"
}[readingStatus.value]));
const completionSummary = computed(() => {
  if (readingStatus.value === "skipped") return "本课当前已跳过，可恢复学习后再完成。";
  if (readingStatus.value === "completed" && masteryState.value === "needs-review") {
    return `阅读已完成，${reviewCount.value} 道题仍在复习队列中。`;
  }
  if (readingStatus.value === "completed" && masteryState.value === "mastered") {
    return "阅读和当前验收均已完成，可以继续下一课。";
  }
  if (readingStatus.value === "completed") return "本课已标记为读完。";
  if (masteryState.value === "needs-review") {
    return `${reviewCount.value} 道题需要复习；阅读与掌握状态会分别保留。`;
  }
  if (masteryState.value === "mastered") return "当前验收已经稳定，读完正文后即可结束本课。";
  return "读完正文并完成本课验收后，在这里结束本课。";
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function currentReadingPosition() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const headings = [...document.querySelectorAll<HTMLElement>(".vp-doc h2[id], .vp-doc h3[id]")];
  let active: HTMLElement | undefined;
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= 150) active = heading;
    else break;
  }
  return {
    anchor: active?.id,
    heading: active?.textContent
      ?.replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/#$/, "")
      .trim(),
    scrollY: window.scrollY
  };
}

function savePosition(source = unit.value?.source) {
  if (!source || typeof window === "undefined") return;
  const position = currentReadingPosition();
  if (position) progress.saveReadingPosition(source, position);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    savePosition();
  }, 450);
}

function handlePageHide() {
  savePosition();
}

async function restorePosition() {
  if (!unit.value || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("resume") !== "1" || url.hash) return;
  const position = progress.getUnitProgress(unit.value.source)?.position;
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (position) window.scrollTo({ top: position.scrollY, behavior: "auto" });
      url.searchParams.delete("resume");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    });
  });
}

function recordVisit() {
  if (!unit.value) return;
  progress.markVisited(unit.value.source);
  restorePosition();
}

function toggleSkipped() {
  if (!unit.value) return;
  if (readingStatus.value === "skipped") progress.setInProgress(unit.value.source);
  else progress.markSkipped(unit.value.source);
}

onMounted(() => {
  initializeProgress();
  recordVisit();
  window.addEventListener("scroll", scheduleSave, { passive: true });
  window.addEventListener("pagehide", handlePageHide, { passive: true });
});

watch(
  () => page.value.relativePath,
  async (nextSource, previousSource) => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    if (previousSource && previousSource !== nextSource) savePosition(previousSource);
    await nextTick();
    recordVisit();
  },
  { flush: "pre" }
);

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  savePosition();
  window.removeEventListener("scroll", scheduleSave);
  window.removeEventListener("pagehide", handlePageHide);
});
</script>

<template>
  <div
    v-if="unit"
    class="lesson-completion"
    :class="[`reading-${readingStatus}`, `mastery-${masteryState}`]"
    :data-unit-source="unit.source"
    aria-labelledby="lesson-completion-title"
  >
    <div class="lesson-completion-main">
      <div>
        <p class="lesson-completion-kicker">学习收尾</p>
        <h2 id="lesson-completion-title">完成本课</h2>
        <p>{{ completionSummary }}</p>
      </div>
      <div class="lesson-identity" role="group" aria-label="本课状态">
        <span v-if="unit.code" class="lesson-day">{{ unit.code }}</span>
        <span class="lesson-phase">{{ unit.track }}</span>
        <span class="lesson-reading">{{ readingLabel }}</span>
        <span v-if="masteryState !== 'unassessed'" class="lesson-mastery">{{ masteryLabel }}</span>
      </div>
    </div>
    <div class="lesson-toolbar-actions">
      <button type="button" class="lesson-skip-button" @click="toggleSkipped">
        {{ readingStatus === "skipped" ? "恢复学习" : "暂时跳过" }}
      </button>
      <button
        type="button"
        class="lesson-complete-button"
        :aria-pressed="readingStatus === 'completed'"
        @click="progress.toggleCompleted(unit.source)"
      >
        {{ readingStatus === "completed" ? "已读完" : "完成本次学习" }}
      </button>
    </div>
  </div>
</template>
