<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { withBase } from "vitepress";

type Paper = {
  id: string;
  family: string;
  title: string;
  kind: string;
  evidence: string;
  level: string;
  url: string;
  study: {
    problem: string;
    mechanism: string;
    training: string;
    evidence: string;
    boundary: string;
  };
};

type CourseLink = { title: string; href: string };
type PaperLessonSpec = {
  paper: Paper;
  sequence: {
    position: number;
    total: number;
    seriesTitle: string;
    seriesHref: string;
    previous?: CourseLink;
    next?: CourseLink;
  };
};

const props = defineProps<{ spec: string }>();
const lesson = computed(() => JSON.parse(decodeURIComponent(props.spec)) as PaperLessonSpec);
const activeIndex = ref(0);
const recallMode = ref(false);
const revealed = ref<number[]>([]);
const lastRecall = ref<number | null>(null);
const statusMessage = ref("");
const recallStorageKey = "llmtrain-paper-memory-v1";
const tabBaseId = useId();
const panelId = `${tabBaseId}-panel`;

const stages = computed(() => [
  { key: "problem", label: "问题", prompt: "论文为什么出现", body: lesson.value.paper.study.problem },
  { key: "mechanism", label: "改动", prompt: "它改变哪一步", body: lesson.value.paper.study.mechanism },
  { key: "training", label: "分工", prompt: "训练与运行", body: lesson.value.paper.study.training },
  { key: "evidence", label: "证据", prompt: "凭什么相信", body: lesson.value.paper.study.evidence },
  { key: "boundary", label: "边界", prompt: "何时会失效", body: lesson.value.paper.study.boundary }
]);
const activeStage = computed(() => stages.value[activeIndex.value]);
const activeRevealed = computed(() => !recallMode.value || revealed.value.includes(activeIndex.value));
const allRevealed = computed(() => revealed.value.length === stages.value.length);
const progress = computed(() => activeIndex.value / Math.max(stages.value.length - 1, 1));
const lastRecallLabel = computed(() => {
  if (!lastRecall.value) return "尚未闭卷回放";
  return `上次回放：${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(lastRecall.value)}`;
});

function readRecallTimes(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(recallStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveRecall() {
  if (lastRecall.value && Date.now() - lastRecall.value < 1000) return;
  const now = Date.now();
  lastRecall.value = now;
  try {
    const values = readRecallTimes();
    values[lesson.value.paper.id] = now;
    window.localStorage.setItem(recallStorageKey, JSON.stringify(values));
    statusMessage.value = "五个节点已核对，建议明天再闭卷串一次";
  } catch {
    statusMessage.value = "五个节点已核对；当前浏览器未允许保存时间";
  }
}

function selectStage(index: number, reveal = true) {
  activeIndex.value = index;
  if (!recallMode.value || !reveal || revealed.value.includes(index)) return;
  revealed.value = [...revealed.value, index];
  if (revealed.value.length === stages.value.length) saveRecall();
}

function previewStage(index: number) {
  if (!recallMode.value) activeIndex.value = index;
}

function tabId(index: number) {
  return `${tabBaseId}-tab-${index}`;
}

function handleTabKey(event: KeyboardEvent, index: number) {
  const lastIndex = stages.value.length - 1;
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = index === lastIndex ? 0 : index + 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = index === 0 ? lastIndex : index - 1;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = lastIndex;
  if (nextIndex === null) return;

  event.preventDefault();
  selectStage(nextIndex, false);
  const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabs?.[nextIndex]?.focus();
}

function toggleRecall() {
  recallMode.value = !recallMode.value;
  activeIndex.value = 0;
  revealed.value = [];
  statusMessage.value = recallMode.value ? "先复述，再依次点击五个节点核对" : "";
}

onMounted(() => {
  lastRecall.value = readRecallTimes()[lesson.value.paper.id] ?? null;
});

watch(
  () => lesson.value.paper.id,
  (id) => {
    activeIndex.value = 0;
    recallMode.value = false;
    revealed.value = [];
    statusMessage.value = "";
    lastRecall.value = readRecallTimes()[id] ?? null;
  }
);
</script>

<template>
  <section class="paper-memory" :class="{ 'is-recalling': recallMode }">
    <header class="paper-memory-header">
      <div>
        <p class="paper-memory-kicker">
          {{ lesson.sequence.seriesTitle }} · 第 {{ lesson.sequence.position }} / {{ lesson.sequence.total }} 篇
        </p>
        <h2>先在脑中留下一张五节点图</h2>
        <p>不要记整页句子，只记住这篇论文从哪个问题出发、改了哪一步、用什么证据成立，以及边界在哪里。</p>
      </div>
      <div class="paper-memory-actions">
        <a class="paper-memory-primary" :href="lesson.paper.url" target="_blank" rel="noreferrer">论文原文</a>
        <a :href="withBase('/06-拓展知识库/论文研读/03-如何读懂一篇论文')">阅读方法</a>
        <a :href="withBase(lesson.sequence.seriesHref)">系列路线</a>
        <button type="button" :aria-pressed="recallMode" @click="toggleRecall">
          {{ recallMode ? "退出回放" : "闭卷回放" }}
        </button>
      </div>
    </header>

    <div class="paper-memory-figure" :style="{ '--memory-progress': progress }">
      <div class="paper-memory-track" aria-hidden="true"><span /></div>
      <div class="paper-memory-nodes" role="tablist" aria-label="论文认知骨架">
        <button
          v-for="(stage, index) in stages"
          :key="stage.key"
          type="button"
          role="tab"
          :id="tabId(index)"
          :aria-controls="panelId"
          :aria-selected="activeIndex === index"
          :tabindex="activeIndex === index ? 0 : -1"
          :class="[`stage-${stage.key}`, { active: activeIndex === index, revealed: revealed.includes(index) }]"
          :style="{ '--memory-delay': `${index * 90}ms` }"
          @mouseenter="previewStage(index)"
          @focus="previewStage(index)"
          @click="selectStage(index)"
          @keydown="handleTabKey($event, index)"
        >
          <span class="paper-memory-mark" aria-hidden="true">{{ index + 1 }}</span>
          <span class="paper-memory-label">{{ stage.label }}</span>
          <small>{{ stage.prompt }}</small>
        </button>
      </div>

      <div
        :id="panelId"
        :class="['paper-memory-detail', `stage-${activeStage.key}`]"
        role="tabpanel"
        :aria-labelledby="tabId(activeIndex)"
        aria-live="polite"
      >
        <p class="paper-memory-detail-label">{{ activeStage.label }} · {{ activeStage.prompt }}</p>
        <p v-if="activeRevealed">{{ activeStage.body }}</p>
        <p v-else class="paper-memory-hidden">先用自己的话复述这一格，再点击上方节点核对。</p>
      </div>
    </div>

    <footer class="paper-memory-footer">
      <a v-if="lesson.sequence.previous" :href="withBase(lesson.sequence.previous.href)">
        上一篇 · {{ lesson.sequence.previous.title }}
      </a>
      <span v-else>这是本系列主线的第一篇</span>
      <p aria-live="polite">{{ allRevealed ? statusMessage : lastRecallLabel }}</p>
      <a v-if="lesson.sequence.next" :href="withBase(lesson.sequence.next.href)">
        下一篇 · {{ lesson.sequence.next.title }}
      </a>
      <span v-else>这是本系列主线的最后一篇</span>
    </footer>
  </section>
</template>

<style scoped>
.paper-memory {
  --memory-problem: #c2415b;
  --memory-mechanism: #0f766e;
  --memory-training: #2563a6;
  --memory-evidence: #4d7c0f;
  --memory-boundary: #b45309;
  margin: 1.25rem 0 2.5rem;
  border-block: 1px solid var(--vp-c-divider);
}

.paper-memory-header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.25rem 0 1rem;
}

.paper-memory-kicker,
.paper-memory-header p,
.paper-memory-detail-label,
.paper-memory-footer p {
  margin: 0;
}

.paper-memory-kicker {
  color: var(--vp-c-brand-1);
  font-size: 0.8rem;
  font-weight: 700;
}

.paper-memory-header h2 {
  margin: 0.3rem 0 0.45rem;
  font-size: 1.2rem;
}

.paper-memory-header > div:first-child > p:last-child {
  max-width: 44rem;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.65;
}

.paper-memory-actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 0.45rem;
  flex-wrap: wrap;
  max-width: 25rem;
}

.paper-memory-actions a,
.paper-memory-actions button {
  display: inline-flex;
  align-items: center;
  min-height: 2.15rem;
  padding: 0.38rem 0.65rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.25;
  cursor: pointer;
}

.paper-memory-actions .paper-memory-primary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  font-weight: 700;
}

.paper-memory-actions button[aria-pressed="true"] {
  border-color: var(--memory-boundary);
  color: var(--memory-boundary);
}

.paper-memory-figure {
  position: relative;
  padding: 1rem 0;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 78%, transparent);
}

.paper-memory-track {
  position: absolute;
  top: 2.06rem;
  right: 10%;
  left: 10%;
  height: 3px;
  overflow: hidden;
  background: var(--vp-c-divider);
}

.paper-memory-track span {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--memory-problem), var(--memory-mechanism), var(--memory-training), var(--memory-evidence), var(--memory-boundary));
  transform: scaleX(var(--memory-progress));
  transform-origin: left center;
  transition: transform 260ms ease;
}

.paper-memory-nodes {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.paper-memory-nodes button {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  min-width: 0;
  padding: 0 0.35rem 0.75rem;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  font: inherit;
  cursor: pointer;
  opacity: 0;
  transform: translateY(6px);
  animation: paper-memory-enter 360ms ease forwards;
  animation-delay: var(--memory-delay);
}

.paper-memory-nodes button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.paper-memory-mark {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  color: white;
  font-size: 0.78rem;
  font-weight: 800;
  box-shadow: 0 0 0 4px var(--vp-c-bg-soft);
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.stage-problem { --stage-color: var(--memory-problem); }
.stage-mechanism { --stage-color: var(--memory-mechanism); }
.stage-training { --stage-color: var(--memory-training); }
.stage-evidence { --stage-color: var(--memory-evidence); }
.stage-boundary { --stage-color: var(--memory-boundary); }
.stage-problem .paper-memory-mark { border-radius: 50%; background: var(--stage-color); }
.stage-mechanism .paper-memory-mark { background: var(--stage-color); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.stage-training .paper-memory-mark { border-radius: 3px; background: var(--stage-color); }
.stage-evidence .paper-memory-mark { background: var(--stage-color); clip-path: polygon(25% 7%, 75% 7%, 100% 50%, 75% 93%, 25% 93%, 0 50%); }
.stage-boundary .paper-memory-mark { border-radius: 50% 50% 18% 18%; background: var(--stage-color); }

.paper-memory-nodes button.active .paper-memory-mark {
  transform: scale(1.13);
  box-shadow: 0 0 0 4px var(--vp-c-bg-soft), 0 0 0 7px color-mix(in srgb, var(--stage-color) 30%, transparent);
}

.paper-memory-label {
  color: var(--vp-c-text-1);
  font-size: 0.88rem;
  font-weight: 700;
}

.paper-memory-nodes small {
  min-height: 2rem;
  color: var(--vp-c-text-3);
  font-size: 0.72rem;
  line-height: 1.4;
}

.paper-memory-detail {
  min-height: 8.2rem;
  margin: 0.25rem 1rem 0;
  padding: 1rem 1.1rem;
  border-inline-start: 4px solid var(--vp-c-brand-1);
  background: var(--vp-c-bg);
}

.paper-memory-detail.stage-problem,
.paper-memory-detail.stage-mechanism,
.paper-memory-detail.stage-training,
.paper-memory-detail.stage-evidence,
.paper-memory-detail.stage-boundary {
  border-inline-start-color: var(--stage-color);
}

.paper-memory-detail-label {
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
  font-weight: 700;
}

.paper-memory-detail > p:last-child {
  margin: 0.55rem 0 0;
  font-size: 0.94rem;
  line-height: 1.75;
}

.paper-memory-hidden {
  color: var(--vp-c-text-3);
  font-style: italic;
}

.paper-memory-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 0;
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
}

.paper-memory-footer > :last-child { text-align: right; }
.paper-memory-footer p { color: var(--vp-c-text-3); text-align: center; }

@keyframes paper-memory-enter {
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .paper-memory-nodes button { opacity: 1; transform: none; animation: none; }
  .paper-memory-track span, .paper-memory-mark { transition: none; }
}

@media (max-width: 720px) {
  .paper-memory-header { display: block; }
  .paper-memory-actions { justify-content: flex-start; max-width: none; margin-top: 0.9rem; }
  .paper-memory-actions a, .paper-memory-actions button { min-height: 2.75rem; }
  .paper-memory-track { display: none; }
  .paper-memory-nodes { grid-template-columns: 1fr; padding: 0 0.75rem; }
  .paper-memory-nodes button {
    grid-template-columns: 2.5rem 4rem minmax(0, 1fr);
    align-items: center;
    justify-items: start;
    gap: 0.45rem;
    min-height: 3.1rem;
    padding: 0.38rem 0;
    border-bottom: 1px solid var(--vp-c-divider);
  }
  .paper-memory-mark { width: 1.9rem; height: 1.9rem; }
  .paper-memory-nodes small { min-height: 0; text-align: left; }
  .paper-memory-detail { min-height: 10rem; margin: 0.8rem 0.75rem 0; }
  .paper-memory-footer { grid-template-columns: 1fr 1fr; align-items: start; }
  .paper-memory-footer p { grid-column: 1 / -1; grid-row: 1; text-align: left; }
  .paper-memory-footer > :last-child { text-align: right; }
}
</style>
