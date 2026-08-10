<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { withBase } from "vitepress";
import { learningUnits } from "../../course-data.mjs";
import { initializeProgress, useCourseProgress } from "../progress";

const progress = useCourseProgress();

const groupedUnits = computed(() => {
  const groups = new Map<string, typeof learningUnits>();
  for (const unit of learningUnits) {
    const current = groups.get(unit.track) ?? [];
    current.push(unit);
    groups.set(unit.track, current);
  }
  return [...groups.entries()].map(([track, units]) => ({ track, units }));
});

const resumeUnit = computed(() => {
  const last = progress.lastSessionUnit.value;
  if (last && progress.getReadingStatus(last.source) === "in-progress") return last;
  return null;
});

const continuePosition = computed(() =>
  resumeUnit.value ? progress.getUnitProgress(resumeUnit.value.source)?.position : undefined
);

const reflectionUnit = computed(() => progress.lastSessionUnit.value);
const reflectionDraft = ref("");
const reflectionDirty = ref(false);
const reflectionStatus = ref("");
const loadedReflectionSource = ref<string | null>(null);

watch(
  () => [reflectionUnit.value?.source ?? null, progress.revision.value] as const,
  ([source]) => {
    if (!source) return;
    const saved = progress.getUnitProgress(source)?.reflection ?? "";
    if (loadedReflectionSource.value !== source) {
      loadedReflectionSource.value = source;
      reflectionDraft.value = saved;
      reflectionDirty.value = false;
      reflectionStatus.value = "";
      return;
    }
    if (!reflectionDirty.value) reflectionDraft.value = saved;
  },
  { immediate: true }
);

const skippedUnits = computed(() =>
  learningUnits.filter((unit) => progress.getReadingStatus(unit.source) === "skipped")
);

const conceptCounts = computed(() => {
  const counts = { fragile: 0, rebuilding: 0, stable: 0 };
  for (const concept of progress.conceptSummaries.value) {
    if (concept.state !== "unassessed") counts[concept.state] += 1;
  }
  return counts;
});

const recommendedUnit = computed(() => progress.nextRecommendedUnit());
const recommendedConcept = computed(() => progress.nextRecommendedConcept());
const recommendedHref = computed(() => {
  const dueRecord = progress.dueReviewExercises.value[0];
  if (dueRecord) return reviewHref(dueRecord);
  const concept = recommendedConcept.value?.concept;
  if (concept) return conceptHref(concept);
  return recommendedUnit.value ? withBase(recommendedUnit.value.href) : "";
});
const recommendationAction = computed(() => {
  if (progress.dueReviewExercises.value.length) return "开始复习这道题";
  if (recommendedConcept.value) return "开始补救这道题";
  return "开始这一步";
});
const recommendationReason = computed(() => {
  if (progress.dueReviewExercises.value.length) return "有间隔复习已经到期，先巩固再继续新内容。";
  const recommendation = recommendedConcept.value;
  if (recommendation?.kind === "repeated-misconception") {
    return `“${recommendation.concept.label}”出现了重复误解，优先回到证据最明确的位置补救。`;
  }
  if (recommendation?.kind === "fragile-prerequisite") {
    return recommendation.concept.influenceCount
      ? `“${recommendation.concept.label}”会影响 ${recommendation.concept.influenceCount} 个后续概念，先修复前置更省力。`
      : `“${recommendation.concept.label}”最近证据不稳定，先完成补救与迁移重测。`;
  }
  if (recommendation?.kind === "rebuilding-concept") {
    return `“${recommendation.concept.label}”还缺一次迁移验证，完成后再进入间隔复习。`;
  }
  return "按课程推荐顺序继续建立下一段概念链。";
});

const summary = computed(() => {
  const counts = { inProgress: 0, completed: 0, skipped: 0, review: 0, mastered: 0 };
  for (const unit of learningUnits) {
    const reading = progress.getReadingStatus(unit.source);
    const mastery = progress.getMasteryState(unit.source);
    if (reading === "in-progress") counts.inProgress += 1;
    if (reading === "completed") counts.completed += 1;
    if (reading === "skipped") counts.skipped += 1;
    if (mastery === "needs-review") counts.review += 1;
    if (mastery === "mastered") counts.mastered += 1;
  }
  return counts;
});

function resumeHref(unit: (typeof learningUnits)[number]) {
  return withBase(`${unit.href}${unit.href.includes("?") ? "&" : "?"}resume=1`);
}

function reviewHref(record: { href: string; id: string; anchor: string }) {
  return withBase(`${record.href}?review=${encodeURIComponent(record.id)}#${record.anchor}`);
}

function conceptHref(record: { href: string; exerciseId: string; anchor: string }) {
  return withBase(`${record.href}?review=${encodeURIComponent(record.exerciseId)}#${record.anchor}`);
}

function readingLabel(source: string) {
  return ({
    unstarted: "未开始",
    "in-progress": "学习中",
    completed: "已读完",
    skipped: "已跳过"
  }[progress.getReadingStatus(source)]);
}

function masteryLabel(source: string) {
  return ({
    unassessed: "未检测",
    practicing: "练习中",
    "needs-review": "待复习",
    mastered: "已掌握"
  }[progress.getMasteryState(source)]);
}

function resultLabel(result: string) {
  return ({ correct: "到期复习", partial: "部分正确", incorrect: "答错或未作答" }[result] ?? "待复习");
}

function dueLabel(value?: string) {
  if (!value) return "待安排";
  const timestamp = Date.parse(value);
  if (timestamp <= Date.now()) return "今天复习";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(timestamp);
}

function conceptStateLabel(state: string) {
  return ({
    unassessed: "未检测",
    fragile: "待巩固",
    rebuilding: "补救中",
    stable: "已稳定"
  }[state] ?? state);
}

function evidenceLabel(record: { lastEvidence?: { kind: string; result: string; attemptedAt: string } }) {
  if (!record.lastEvidence) return "尚无作答证据";
  const kind = record.lastEvidence.kind === "transfer" ? "迁移题" : "主问题";
  const result = ({ correct: "答对", partial: "部分正确", incorrect: "未通过" }[record.lastEvidence.result] ?? "已作答");
  const date = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" })
    .format(Date.parse(record.lastEvidence.attemptedAt));
  return `${kind}${result} · ${date}`;
}

function conceptAction(state: string) {
  return ({
    fragile: "补救",
    rebuilding: "完成迁移",
    stable: "查看证据",
    unassessed: "开始检测"
  }[state] ?? "查看");
}

function markReflectionDirty() {
  reflectionDirty.value = true;
  reflectionStatus.value = "";
}

function saveReflection() {
  const source = reflectionUnit.value?.source;
  if (!source) return;
  const normalized = reflectionDraft.value.trim().slice(0, 240);
  progress.saveUnitReflection(source, normalized);
  reflectionDraft.value = normalized;
  reflectionDirty.value = false;
  reflectionStatus.value = normalized ? "已保存到当前浏览器" : "已清除";
}

function reset() {
  if (window.confirm("确认清空当前浏览器中的全部学习记录和答题记录？")) {
    progress.resetProgress();
  }
}

onMounted(initializeProgress);
</script>

<template>
  <section class="progress-center" aria-labelledby="progress-center-title">
    <header class="progress-center-header">
      <div>
        <p class="dashboard-kicker">当前浏览器</p>
        <h2 id="progress-center-title">学习记录与复习</h2>
      </div>
      <button type="button" class="progress-reset-button" @click="reset">清空记录</button>
    </header>

    <div class="progress-summary" role="group" aria-label="学习状态汇总">
      <span><strong>{{ summary.inProgress }}</strong>学习中</span>
      <span><strong>{{ summary.review }}</strong>待复习</span>
      <span><strong>{{ summary.mastered }}</strong>已掌握</span>
      <span><strong>{{ summary.completed }}</strong>已读完</span>
      <span><strong>{{ summary.skipped }}</strong>已跳过</span>
    </div>

    <section v-if="resumeUnit" class="progress-section progress-resume" aria-labelledby="resume-title">
      <div>
        <p class="progress-section-label">继续学习</p>
        <h3 id="resume-title">{{ resumeUnit.title }}</h3>
        <p>{{ continuePosition?.heading || resumeUnit.track }}</p>
      </div>
      <a class="continue-link" :href="resumeHref(resumeUnit)">回到上次位置</a>
    </section>

    <section v-if="reflectionUnit" class="progress-section progress-reflection" aria-labelledby="reflection-title">
      <div>
        <p class="progress-section-label">学习反思</p>
        <h3 id="reflection-title">{{ reflectionUnit.title }}</h3>
        <p>用自己的话留下一个尚未想通的点，后续复习时再核对。</p>
      </div>
      <form class="progress-reflection-form" @submit.prevent="saveReflection">
        <label for="unit-reflection">最模糊的一点</label>
        <textarea
          id="unit-reflection"
          v-model="reflectionDraft"
          rows="3"
          maxlength="240"
          @input="markReflectionDirty"
        />
        <div class="progress-reflection-actions">
          <small aria-live="polite">
            {{ reflectionStatus || `${reflectionDraft.length}/240` }}
          </small>
          <button type="submit" :disabled="!reflectionDirty">保存</button>
        </div>
      </form>
    </section>

    <section v-if="recommendedUnit" class="progress-section progress-recommendation" aria-labelledby="recommendation-title">
      <div>
        <p class="progress-section-label">证据驱动的下一步</p>
        <h3 id="recommendation-title">{{ recommendedUnit.title }}</h3>
        <p>{{ recommendationReason }}</p>
      </div>
      <a class="continue-link" :href="recommendedHref">{{ recommendationAction }}</a>
    </section>
    <section v-else class="progress-section progress-recommendation" aria-labelledby="recommendation-title">
      <div>
        <p class="progress-section-label">证据驱动的下一步</p>
        <h3 id="recommendation-title">当前没有新的推荐单元</h3>
        <p>课程单元均已完成或跳过；可以回看知识结构，或等待复习题到期。</p>
      </div>
      <a class="continue-link" :href="withBase('/00-从这里开始/学科地图')">查看学科地图</a>
    </section>

    <section class="progress-section" aria-labelledby="review-title">
      <div class="progress-section-heading">
        <div>
          <p class="progress-section-label">复习队列</p>
          <h3 id="review-title">{{ progress.needsReviewExercises.value.length }} 道题需要巩固</h3>
        </div>
        <span>{{ progress.dueReviewExercises.value.length }} 道今天到期</span>
      </div>
      <ol v-if="progress.needsReviewExercises.value.length" class="review-list">
        <li v-for="record in progress.needsReviewExercises.value" :key="record.id">
          <a :href="reviewHref(record)">
            <span>
              <strong>{{ record.question }}</strong>
              <small>{{ resultLabel(record.lastResult) }} · {{ dueLabel(record.nextReviewAt) }}</small>
            </span>
            <b>复习</b>
          </a>
        </li>
      </ol>
      <p v-else class="progress-empty">当前没有待复习题目。</p>
    </section>

    <section class="progress-section" aria-labelledby="concept-evidence-title">
      <div class="progress-section-heading">
        <div>
          <p class="progress-section-label">概念证据</p>
          <h3 id="concept-evidence-title">知道“为什么这样判断”</h3>
        </div>
        <span>
          {{ conceptCounts.fragile }} 待巩固 · {{ conceptCounts.rebuilding }} 补救中 · {{ conceptCounts.stable }} 已稳定
        </span>
      </div>
      <ol v-if="progress.conceptSummaries.value.length" class="concept-evidence-list">
        <li v-for="concept in progress.conceptSummaries.value" :key="concept.id">
          <a :href="conceptHref(concept)">
            <span class="concept-evidence-main">
              <span>
                <strong>{{ concept.label }}</strong>
                <b :class="`state-${concept.state}`">{{ conceptStateLabel(concept.state) }}</b>
              </span>
              <small>{{ evidenceLabel(concept) }}</small>
              <small v-if="concept.activeMisconceptions.length">
                活跃误解：{{ concept.activeMisconceptions.map((item) => `${item.label}${item.count > 1 ? ` ×${item.count}` : ""}`).join("；") }}
              </small>
              <small v-if="concept.prerequisiteLabels.length">
                前置：{{ concept.prerequisiteLabels.join("、") }}
              </small>
              <small v-if="concept.unknownPrerequisiteCount">
                {{ concept.prerequisiteLabels.length ? "另有" : "" }} {{ concept.unknownPrerequisiteCount }} 个前置概念尚未检测
              </small>
              <small v-else-if="concept.influenceCount">影响 {{ concept.influenceCount }} 个后续概念</small>
            </span>
            <b>{{ conceptAction(concept.state) }}</b>
          </a>
        </li>
      </ol>
      <p v-else class="progress-empty">完成带概念标记的验收题后，这里会显示作答证据、误解和补救状态。</p>
    </section>

    <section v-if="skippedUnits.length" class="progress-section" aria-labelledby="skipped-title">
      <div class="progress-section-heading">
        <div>
          <p class="progress-section-label">暂时跳过</p>
          <h3 id="skipped-title">{{ skippedUnits.length }} 个单元</h3>
        </div>
      </div>
      <ul class="skipped-list">
        <li v-for="unit in skippedUnits" :key="unit.source">
          <a :href="withBase(unit.href)">{{ unit.title }}</a>
          <button type="button" @click="progress.setInProgress(unit.source)">恢复学习</button>
        </li>
      </ul>
    </section>

    <section class="progress-section" aria-labelledby="routes-title">
      <div class="progress-section-heading">
        <div>
          <p class="progress-section-label">全部路线</p>
          <h3 id="routes-title">课程状态</h3>
        </div>
      </div>
      <div class="progress-routes">
        <section v-for="group in groupedUnits" :key="group.track">
          <h4>{{ group.track }}</h4>
          <ol>
            <li v-for="unit in group.units" :key="unit.source">
              <a :href="withBase(unit.href)">
                <span>{{ unit.code ? `${unit.code} · ` : "" }}{{ unit.title }}</span>
                <span class="progress-route-status">
                  <b :class="`state-${progress.getReadingStatus(unit.source)}`">{{ readingLabel(unit.source) }}</b>
                  <b
                    v-if="progress.getMasteryState(unit.source) !== 'unassessed'"
                    :class="`state-${progress.getMasteryState(unit.source)}`"
                  >{{ masteryLabel(unit.source) }}</b>
                </span>
              </a>
            </li>
          </ol>
        </section>
      </div>
    </section>
  </section>
</template>
