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
      <p class="paper-detail-kicker">{{ activePaper?.family }} · 单篇研读卡</p>
      <h1 :id="titleId">{{ activePaper?.title }}</h1>
      <p class="paper-detail-lead">{{ activePaper?.note }}</p>
      <div class="paper-detail-meta">
        <span>{{ activePaper?.year }}</span>
        <span>{{ activePaper?.kind }}</span>
        <span>{{ activePaper?.level }}</span>
        <span v-for="topic in activePaper?.topics" :key="topic">{{ topic }}</span>
      </div>
    </header>

    <div class="paper-detail-actions">
      <label>
        <span>阅读状态</span>
        <select :value="state" @change="saveState(($event.target as HTMLSelectElement).value as ReadingState)">
          <option value="unread">未安排</option>
          <option value="queued">待读</option>
          <option value="reading">研读中</option>
          <option value="reviewed">已复核</option>
        </select>
      </label>
      <a class="paper-detail-source" :href="activePaper?.url" target="_blank" rel="noreferrer">打开论文原文</a>
      <a v-if="richHref" class="paper-detail-rich" :href="withBase(richHref)">进入完整深读</a>
      <small aria-live="polite">{{ statusMessage }}</small>
    </div>

    <section v-if="activePaper?.study" class="paper-detail-section paper-study-brief">
      <h2>这篇论文具体值得学什么</h2>
      <p class="paper-study-problem">{{ activePaper.study.problem }}</p>
      <div class="paper-study-grid">
        <article>
          <h3>关键机制与信息流</h3>
          <p>{{ activePaper.study.mechanism }}</p>
        </article>
        <article>
          <h3>训练与推理的分界</h3>
          <p>{{ activePaper.study.training }}</p>
        </article>
        <article>
          <h3>证据怎么核对</h3>
          <p>{{ activePaper.study.evidence }}</p>
        </article>
        <article>
          <h3>方法边界</h3>
          <p>{{ activePaper.study.boundary }}</p>
        </article>
      </div>
    </section>

    <section class="paper-detail-section">
      <h2>先回答这篇论文解决什么</h2>
      <p>不要从模型名称开始背。先写出真实场景、旧方法的瓶颈、论文改变的环节，以及它用什么基线证明改动有效。</p>
      <ol>
        <li>问题发生在表示、架构、数据、训练、推理还是系统？</li>
        <li>输入是什么，信息经过哪些模块，输出在哪里被验收？</li>
        <li>哪些参数在训练时更新，哪些状态只在本次推理存在？</li>
      </ol>
    </section>

    <section class="paper-detail-section">
      <h2>小白研读清单</h2>
      <div class="paper-detail-grid">
        <article><strong>1 · 找基线</strong><p>作者拿谁比较？比较的是裸模型、后训练模型，还是带工具的完整系统？</p></article>
        <article><strong>2 · 画信息流</strong><p>把数据、token/模态表示、主干、缓存、工具和输出头按顺序画出来。</p></article>
        <article><strong>3 · 分训练与推理</strong><p>训练改变权重；推理改变提示、预算、采样、工具和调度。不要混为“模型自己学会了”。</p></article>
        <article><strong>4 · 对账一个数字</strong><p>记录版本、数据、上下文、硬件、精度、预算和评测脚本，复算一个比例或资源量。</p></article>
        <article><strong>5 · 找失败边界</strong><p>构造一个会漏证据、奖励失真、模态错位或系统成本反超的反例。</p></article>
      </div>
    </section>

    <section class="paper-detail-section">
      <h2>证据边界</h2>
      <p>来源类型是“{{ activePaper?.kind }}”，原始证据标为“{{ activePaper?.evidence }}”。它能证明报告公开记录的配置和实验，不能自动证明所有任务、硬件和版本都得到相同结果。完成数字对账和失败反例后，再把状态改为“已复核”。</p>
      <p v-if="activePaper?.source">官方关联入口：{{ activePaper.source }}</p>
    </section>
  </section>
</template>

<style scoped>
.paper-detail { margin: 1rem 0 3rem; }
.paper-detail-header { border-bottom: 1px solid var(--vp-c-divider); padding-bottom: 1.5rem; }
.paper-detail-kicker { margin: 0; color: var(--vp-c-brand-1); font-size: 0.82rem; font-weight: 700; letter-spacing: 0.08em; }
.paper-detail-header h1 { margin: 0.45rem 0 0.7rem; line-height: 1.25; }
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
