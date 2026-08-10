<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { useRouter, withBase } from "vitepress";

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
  note: string;
  courseTitle?: string;
  detailHref?: string;
  study?: {
    problem: string;
    mechanism: string;
    training: string;
    evidence: string;
    boundary: string;
  };
};

type Catalog = { updated: string; papers: Paper[] };
type ReadingState = "unread" | "queued" | "reading" | "reviewed";

const props = defineProps<{ spec: string }>();
const catalog = JSON.parse(decodeURIComponent(props.spec)) as Catalog;
const router = useRouter();
const activeId = ref(catalog.papers[0]?.id ?? "");
const state = ref<ReadingState>("unread");
const statusMessage = ref("");
const titleId = useId();
const storageKey = "llmtrain-paper-reading-v1";

const activePaper = computed(() => catalog.papers.find((paper) => paper.id === activeId.value) ?? catalog.papers[0]);
const richHref = computed(() => {
  const href = activePaper.value?.detailHref;
  return href && !href.includes("/论文详情?") ? href : "";
});
const familySeriesHrefs: Record<string, string> = {
  GLM: "/06-拓展知识库/论文研读/04-GLM系列演进",
  Kimi: "/06-拓展知识库/论文研读/05-Kimi系列演进",
  DeepSeek: "/06-拓展知识库/论文研读/06-DeepSeek系列演进",
  Qwen: "/06-拓展知识库/论文研读/07-Qwen系列演进"
};
const memorySpec = computed(() => {
  const paper = activePaper.value;
  if (!paper?.study) return "";
  const familyPapers = catalog.papers.filter((entry) => entry.family === paper.family);
  const index = Math.max(familyPapers.findIndex((entry) => entry.id === paper.id), 0);
  const linkFor = (entry: Paper | undefined) => entry?.detailHref
    ? { title: entry.courseTitle ?? entry.title, href: entry.detailHref }
    : undefined;
  return encodeURIComponent(JSON.stringify({
    paper,
    sequence: {
      position: index + 1,
      total: familyPapers.length,
      seriesTitle: `${paper.family} 系列材料`,
      seriesHref: familySeriesHrefs[paper.family] ?? "/06-拓展知识库/论文研读/01-论文库",
      previous: linkFor(familyPapers[index - 1]),
      next: linkFor(familyPapers[index + 1])
    }
  }));
});

function readStates(): Record<string, ReadingState> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function loadActivePaper(search = window.location.search) {
  const id = new URLSearchParams(search).get("id");
  if (id && catalog.papers.some((paper) => paper.id === id)) activeId.value = id;
  state.value = readStates()[activeId.value] ?? "unread";
  statusMessage.value = "";
}

function saveState(value: ReadingState) {
  state.value = value;
  try {
    const states = readStates();
    states[activeId.value] = value;
    window.localStorage.setItem(storageKey, JSON.stringify(states));
    statusMessage.value = "已保存到当前浏览器";
  } catch {
    statusMessage.value = "当前浏览器未允许保存";
  }
}

let previousAfterRouteChange: typeof router.onAfterRouteChange;

async function handleAfterRouteChange(href: string) {
  await previousAfterRouteChange?.(href);
  const target = new URL(href, window.location.href);
  if (target.pathname === window.location.pathname) loadActivePaper(target.search);
}

onMounted(() => {
  loadActivePaper();
  previousAfterRouteChange = router.onAfterRouteChange;
  router.onAfterRouteChange = handleAfterRouteChange;
});

onBeforeUnmount(() => {
  if (router.onAfterRouteChange === handleAfterRouteChange) {
    router.onAfterRouteChange = previousAfterRouteChange;
  }
});
</script>

<template>
  <section class="paper-detail" :aria-labelledby="titleId">
    <header class="paper-detail-header">
      <p class="paper-detail-kicker">{{ activePaper?.family }} · 论文导读</p>
      <h2 :id="titleId">{{ activePaper?.title }}</h2>
      <p class="paper-detail-lead">{{ activePaper?.note }}</p>
      <div class="paper-detail-meta">
        <span>{{ activePaper?.year }}</span>
        <span>{{ activePaper?.kind }}</span>
        <span>{{ activePaper?.level }}</span>
        <span v-for="topic in activePaper?.topics" :key="topic">{{ topic }}</span>
      </div>
    </header>

    <PaperLessonMap v-if="memorySpec" :spec="memorySpec" />

    <div class="paper-detail-actions">
      <label>
        <span>阅读状态</span>
        <select :value="state" @change="saveState(($event.target as HTMLSelectElement).value as ReadingState)">
          <option value="unread">未安排</option>
          <option value="queued">想学习</option>
          <option value="reading">学习中</option>
          <option value="reviewed">已学完</option>
        </select>
      </label>
      <a v-if="richHref" class="paper-detail-rich" :href="withBase(richHref)">进入完整深读</a>
      <small aria-live="polite">{{ statusMessage }}</small>
    </div>

    <section class="paper-detail-section">
      <h2>把它放回论文知识图谱</h2>
      <p>这篇材料连接到 <strong>{{ activePaper?.topics.join("、") }}</strong>。学习完整课件后，可以回到<a :href="withBase('/06-拓展知识库/论文研读/02-跨系列问题地图')">论文知识图谱</a>，与同一问题下的另一种方案比较。</p>
    </section>

    <section class="paper-detail-section">
      <h2>原始材料</h2>
      <p>材料类型：{{ activePaper?.kind }}。公开来源：{{ activePaper?.evidence }}。论文中的结果只对应它记录的数据、模型版本、预算和评测条件。</p>
      <p v-if="activePaper?.source">官方关联入口：{{ activePaper.source }}</p>
    </section>
  </section>
</template>

<style scoped>
.paper-detail { margin: 1rem 0 3rem; }
.paper-detail-header { border-bottom: 1px solid var(--vp-c-divider); padding-bottom: 1.5rem; }
.paper-detail-kicker { margin: 0; color: var(--vp-c-brand-1); font-size: 0.82rem; font-weight: 700; letter-spacing: 0.08em; }
.paper-detail-header h2 { margin: 0.45rem 0 0.7rem; line-height: 1.25; }
.paper-detail-lead { max-width: 52rem; margin: 0; color: var(--vp-c-text-2); }
.paper-detail-meta { display: flex; gap: 0.45rem; flex-wrap: wrap; margin-top: 1rem; }
.paper-detail-meta span { padding: 0.2rem 0.5rem; border: 1px solid var(--vp-c-divider); border-radius: 3px; font-size: 0.8rem; }
.paper-detail-actions { display: flex; align-items: end; gap: 0.8rem; flex-wrap: wrap; padding: 1rem 0; border-bottom: 1px solid var(--vp-c-divider); }
.paper-detail-actions label { display: grid; gap: 0.3rem; color: var(--vp-c-text-2); font-size: 0.8rem; }
.paper-detail-actions select { min-height: 2.2rem; padding: 0.35rem 0.5rem; border: 1px solid var(--vp-c-divider); border-radius: 4px; background: var(--vp-c-bg); color: var(--vp-c-text-1); }
.paper-detail-source, .paper-detail-rich { display: inline-flex; align-items: center; min-height: 2.2rem; padding: 0.35rem 0.7rem; border: 1px solid var(--vp-c-divider); border-radius: 4px; font-size: 0.86rem; }
.paper-detail-rich { border-color: var(--vp-c-brand-1); background: color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--vp-c-bg)); }
.paper-detail-actions small { color: var(--vp-c-text-2); }
.paper-detail-section { margin-top: 2rem; }
.paper-detail-section h2 { margin-bottom: 0.65rem; }
.paper-study-problem { margin: 0 0 1rem; font-size: 1.05rem; color: var(--vp-c-text-1); }
.paper-study-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.paper-study-grid article { padding: 0.9rem; border-inline-start: 3px solid var(--vp-c-brand-1); background: var(--vp-c-bg-soft); }
.paper-study-grid h3 { margin: 0; font-size: 0.95rem; }
.paper-study-grid p { margin: 0.45rem 0 0; color: var(--vp-c-text-2); font-size: 0.92rem; line-height: 1.65; }
.paper-detail-section ol { padding-left: 1.25rem; }
.paper-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.paper-detail-grid article { padding: 0.9rem; border: 1px solid var(--vp-c-divider); border-radius: 4px; background: var(--vp-c-bg-soft); }
.paper-detail-grid p { margin: 0.4rem 0 0; color: var(--vp-c-text-2); font-size: 0.9rem; }
@media (max-width: 640px) { .paper-detail-grid, .paper-study-grid { grid-template-columns: 1fr; } }
</style>
