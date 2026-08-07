import { computed, ref } from "vue";
import { courseLessons } from "../course-data.mjs";

const STORAGE_KEY = "llmtrain-progress-v1";
const completedSources = ref<string[]>([]);
const lastVisitedSource = ref<string | null>(null);
let initialized = false;

type StoredProgress = {
  completed?: string[];
  lastVisited?: string | null;
};

function persist() {
  if (typeof window === "undefined") return;
  const payload: StoredProgress = {
    completed: completedSources.value,
    lastVisited: lastVisitedSource.value
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function applyStoredValue(raw: string | null) {
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as StoredProgress;
    const validSources = new Set(courseLessons.map((lesson) => lesson.source));
    completedSources.value = Array.isArray(parsed.completed)
      ? parsed.completed.filter((source) => validSources.has(source))
      : [];
    lastVisitedSource.value =
      parsed.lastVisited && validSources.has(parsed.lastVisited)
        ? parsed.lastVisited
        : null;
  } catch {
    completedSources.value = [];
    lastVisitedSource.value = null;
  }
}

export function initializeProgress() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  applyStoredValue(window.localStorage.getItem(STORAGE_KEY));
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) applyStoredValue(event.newValue);
  });
}

export function useCourseProgress() {
  const completed = computed(() => new Set(completedSources.value));
  const completedCount = computed(() => completedSources.value.length);
  const percent = computed(() =>
    Math.round((completedCount.value / courseLessons.length) * 100)
  );

  function isCompleted(source: string) {
    return completed.value.has(source);
  }

  function toggleCompleted(source: string) {
    const next = new Set(completedSources.value);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    completedSources.value = courseLessons
      .map((lesson) => lesson.source)
      .filter((lessonSource) => next.has(lessonSource));
    persist();
  }

  function markVisited(source: string) {
    if (!courseLessons.some((lesson) => lesson.source === source)) return;
    lastVisitedSource.value = source;
    persist();
  }

  function resetProgress() {
    completedSources.value = [];
    lastVisitedSource.value = null;
    persist();
  }

  return {
    completed,
    completedCount,
    percent,
    lastVisitedSource,
    isCompleted,
    toggleCompleted,
    markVisited,
    resetProgress
  };
}
