<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { withBase } from "vitepress";

type Paper = {
  id: string;
  family: string;
  year: number;
  title: string;
  kind: string;
  evidence: string;
  topics: string[];
  level: string;
  url: string;
  source?: string;
  detailHref?: string;
  note: string;
};

type Catalog = {
  updated: string;
  papers: Paper[];
};

type ReadingState = "unread" | "queued" | "reading" | "reviewed";

const props = defineProps<{ spec: string }>();
const catalog = JSON.parse(decodeURIComponent(props.spec)) as Catalog;
const titleId = useId();
const query = ref("");
const activeFamily = ref("全部");
const activeTopic = ref("全部");
const activeKind = ref("全部");
const activeLevel = ref("全部");
const progress = ref<Record<string, ReadingState>>({});
const hydrated = ref(false);
const storageUnavailable = ref(false);
const storageKey = "llmtrain-paper-reading-v1";
const readingStates = new Set<ReadingState>(["unread", "queued", "reading", "reviewed"]);
const paperIds = new Set(catalog.papers.map((paper) => paper.id));

const families = computed(() => ["全部", ...new Set(catalog.papers.map((paper) => paper.family))]);
const topics = computed(() => ["全部", ...new Set(catalog.papers.flatMap((paper) => paper.topics))]);
const kinds = computed(() => ["全部", ...new Set(catalog.papers.map((paper) => paper.kind))]);
const levels = computed(() => ["全部", ...new Set(catalog.papers.map((paper) => paper.level))]);

const filteredPapers = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase("zh-CN");
  return catalog.papers.filter((paper) => {
    const haystack = [paper.title, paper.family, paper.kind, paper.evidence, paper.note, ...paper.topics]
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return (
      (!normalizedQuery || haystack.includes(normalizedQuery)) &&
      (activeFamily.value === "全部" || paper.family === activeFamily.value) &&
      (activeTopic.value === "全部" || paper.topics.includes(activeTopic.value)) &&
      (activeKind.value === "全部" || paper.kind === activeKind.value) &&
      (activeLevel.value === "全部" || paper.level === activeLevel.value)
    );
  });
});

const reviewedCount = computed(() => catalog.papers.filter((paper) => progress.value[paper.id] === "reviewed").length);
const queuedCount = computed(() => catalog.papers.filter((paper) => {
  const state = progress.value[paper.id];
  return state === "queued" || state === "reading";
}).length);

function normalizeProgress(value: unknown): Record<string, ReadingState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, state]) => paperIds.has(id) && readingStates.has(state as ReadingState))
  ) as Record<string, ReadingState>;
}

function stateFor(paper: Paper): ReadingState {
  return progress.value[paper.id] ?? "unread";
}

function stateLabel(state: ReadingState) {
  return ({ unread: "未安排", queued: "想学习", reading: "学习中", reviewed: "已学完" })[state];
}

function updateState(paper: Paper, value: ReadingState) {
  progress.value = { ...progress.value, [paper.id]: value };
}

function resetFilters() {
  activeFamily.value = "全部";
  activeTopic.value = "全部";
  activeKind.value = "全部";
  activeLevel.value = "全部";
  query.value = "";
}

onMounted(() => {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(storageKey);
  } catch {
    storageUnavailable.value = true;
  }
  if (saved) {
    try {
      progress.value = normalizeProgress(JSON.parse(saved));
    } catch {
      progress.value = {};
    }
  }
  hydrated.value = true;
});

watch(
  progress,
  (value) => {
    if (!hydrated.value || storageUnavailable.value) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      storageUnavailable.value = true;
    }
  },
  { deep: true }
);
</script>

<template>
  <section class="paper-library" :aria-labelledby="titleId">
    <header class="paper-library-header">
      <div>
        <p class="paper-library-kicker">当前浏览器</p>
        <h2 :id="titleId">论文阅读库</h2>
        <p class="paper-library-intro">
          这是模型系列的论文与技术材料目录。点击标题进入站内课件或论文导读，点击“打开原文”查看 PDF 或官方仓库；学习状态只保存在当前浏览器，不会上传。
        </p>
        <p v-if="storageUnavailable" class="paper-library-storage-warning" role="status">
          当前浏览器未允许保存阅读状态；本次打开期间仍可使用筛选和标记。
        </p>
      </div>
      <div class="paper-library-summary" role="group" aria-label="论文阅读状态">
        <span><strong>{{ catalog.papers.length }}</strong> 篇收录</span>
        <span><strong>{{ queuedCount }}</strong> 篇在队列</span>
        <span><strong>{{ reviewedCount }}</strong> 篇已学完</span>
      </div>
    </header>

    <div class="paper-family-tabs" role="group" aria-label="按模型系列筛选">
      <button
        v-for="family in families"
        :key="family"
        type="button"
        :aria-pressed="activeFamily === family"
        :class="{ active: activeFamily === family }"
        @click="activeFamily = family"
      >
        {{ family }}
      </button>
    </div>

    <div class="paper-library-filters">
      <label>
        <span>搜索标题或主题</span>
        <input
          v-model="query"
          type="text"
          placeholder="例如：长上下文、RL、视觉"
        />
      </label>
      <label>
        <span>研究问题</span>
        <select v-model="activeTopic">
          <option v-for="topic in topics" :key="topic">{{ topic }}</option>
        </select>
      </label>
      <label>
        <span>证据类型</span>
        <select v-model="activeKind">
          <option v-for="kind in kinds" :key="kind">{{ kind }}</option>
        </select>
      </label>
      <label>
        <span>阅读优先级</span>
        <select v-model="activeLevel">
          <option v-for="level in levels" :key="level">{{ level }}</option>
        </select>
      </label>
      <button
        type="button"
        class="paper-filter-reset"
        @click="resetFilters"
      >
        清除筛选
      </button>
    </div>

    <p class="paper-library-result-count" aria-live="polite">
      当前显示 {{ filteredPapers.length }} 篇 · 目录核查至 {{ catalog.updated }}
    </p>

    <ol class="paper-list">
      <li v-for="paper in filteredPapers" :key="paper.id" class="paper-entry">
        <article>
          <div class="paper-entry-main">
            <p class="paper-entry-meta">
              <span>{{ paper.family }}</span><span>{{ paper.year }}</span><span>{{ paper.kind }}</span><span>{{ paper.level }}</span>
            </p>
            <h3>
              <a v-if="paper.detailHref" :href="withBase(paper.detailHref)">{{ paper.title }}</a>
              <a v-else :href="paper.url" target="_blank" rel="noreferrer">{{ paper.title }}</a>
            </h3>
            <p class="paper-entry-note">{{ paper.note }}</p>
            <div class="paper-entry-topics">
              <span v-for="topic in paper.topics" :key="topic">{{ topic }}</span>
            </div>
            <p class="paper-entry-evidence">
              来源：{{ paper.evidence }}<span v-if="paper.source"> · {{ paper.source }}</span>
              <a class="paper-entry-source" :href="paper.url" target="_blank" rel="noreferrer">打开原文</a>
            </p>
          </div>
          <label class="paper-entry-status">
            <span>阅读状态</span>
            <select :value="stateFor(paper)" @change="updateState(paper, ($event.target as HTMLSelectElement).value as ReadingState)">
              <option value="unread">未安排</option>
              <option value="queued">想学习</option>
              <option value="reading">学习中</option>
              <option value="reviewed">已学完</option>
            </select>
            <small>{{ stateLabel(stateFor(paper)) }}</small>
          </label>
        </article>
      </li>
    </ol>
    <p v-if="!filteredPapers.length" class="paper-library-empty">没有匹配的论文，先清除筛选再试。</p>
  </section>
</template>

<style scoped>
.paper-library {
  margin: 2rem 0;
  border-block: 1px solid var(--vp-c-divider);
}

.paper-library-header {
  display: flex;
  justify-content: space-between;
  gap: 2rem;
  padding: 1.5rem 0;
}

.paper-library-kicker,
.paper-library-result-count,
.paper-entry-meta,
.paper-entry-evidence {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.82rem;
}

.paper-library-kicker {
  color: var(--vp-c-brand-1);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.paper-library h2 {
  margin: 0.25rem 0 0.5rem;
}

.paper-library-intro {
  max-width: 52rem;
  margin: 0;
}

.paper-library-storage-warning {
  margin: 0.65rem 0 0;
  color: var(--vp-c-danger-1);
  font-size: 0.82rem;
}

.paper-library-summary {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  min-width: 12rem;
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
}

.paper-library-summary strong {
  display: block;
  color: var(--vp-c-brand-1);
  font-size: 1.35rem;
  line-height: 1;
}

.paper-family-tabs {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.75rem 0;
  border-block: 1px solid var(--vp-c-divider);
}

.paper-family-tabs button,
.paper-filter-reset {
  min-height: 2.2rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.paper-family-tabs button.active {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--vp-c-bg));
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.paper-family-tabs button:focus-visible,
.paper-filter-reset:focus-visible,
.paper-library input:focus-visible,
.paper-library select:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.paper-library-filters {
  display: grid;
  grid-template-columns: minmax(10rem, 2fr) repeat(3, minmax(6.5rem, 1fr)) auto;
  gap: 0.7rem;
  align-items: end;
  padding: 1rem 0;
}

.paper-library-filters label,
.paper-entry-status {
  min-width: 0;
  display: grid;
  gap: 0.3rem;
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
}

.paper-library input,
.paper-library select {
  width: 100%;
  min-height: 2.25rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.paper-filter-reset {
  white-space: nowrap;
}

.paper-library-result-count {
  padding-bottom: 0.8rem;
}

.paper-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.paper-entry {
  border-top: 1px solid var(--vp-c-divider);
}

.paper-entry article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 8rem;
  gap: 1.5rem;
  padding: 1.05rem 0;
}

.paper-entry-meta,
.paper-entry-topics {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.paper-entry-meta span,
.paper-entry-topics span {
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  background: var(--vp-c-bg-soft);
}

.paper-entry h3 {
  margin: 0.45rem 0 0.35rem;
  font-size: 1.02rem;
  line-height: 1.45;
}

.paper-entry-note,
.paper-entry-evidence {
  margin: 0.35rem 0;
}

.paper-entry-evidence {
  font-size: 0.78rem;
}

.paper-entry-source {
  margin-left: 0.55rem;
  white-space: nowrap;
}

.paper-entry-status {
  align-self: start;
}

.paper-entry-status small {
  color: var(--vp-c-brand-1);
  text-align: right;
}

.paper-library-empty {
  padding: 1.5rem 0;
  color: var(--vp-c-text-2);
}

@media (max-width: 760px) {
  .paper-library-header {
    display: block;
  }

  .paper-library-summary {
    margin-top: 1rem;
  }

  .paper-library-filters {
    grid-template-columns: 1fr 1fr;
  }

  .paper-library-filters label:first-child,
  .paper-filter-reset {
    grid-column: 1 / -1;
  }

  .paper-entry article {
    display: block;
  }

  .paper-entry-status {
    width: min(100%, 14rem);
    margin-top: 0.75rem;
  }

  .paper-entry-status small {
    text-align: left;
  }
}
</style>
