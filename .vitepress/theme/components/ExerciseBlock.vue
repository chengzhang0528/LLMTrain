<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useData } from "vitepress";
import { learningUnits, legacyLessonAliases } from "../../course-data.mjs";
import {
  type ConceptRef,
  initializeProgress,
  type MisconceptionRef,
  type RemediationRef,
  type ExerciseResult,
  useCourseProgress
} from "../progress";

type ExerciseType = "qa" | "choice" | "calculation";
type CompareRow = { label: string; left: string; right: string };
type TransferQuestion = {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
};

const props = withDefaults(
  defineProps<{
    id?: string;
    type: ExerciseType;
    question: string;
    options?: string[];
    correct?: string;
    multiple?: boolean;
    answer: string;
    steps: string[];
    mistake?: string;
    compareHeaders?: string[];
    compare?: CompareRow[];
    flow?: string[];
    transfer?: TransferQuestion | null;
    concepts?: ConceptRef[];
    misconceptions?: MisconceptionRef[];
    remediation?: RemediationRef | null;
  }>(),
  {
    id: "",
    options: () => [],
    correct: "",
    multiple: false,
    mistake: "",
    compareHeaders: () => [],
    compare: () => [],
    flow: () => [],
    transfer: null,
    concepts: () => [],
    misconceptions: () => [],
    remediation: null
  }
);

const { page } = useData();
const progress = useCourseProgress();
const revealed = ref(false);
const selectedIndex = ref<number | null>(null);
const attemptedIndex = ref<number | null>(null);
const selectedIndexes = ref<number[]>([]);
const attemptedIndexes = ref<number[]>([]);
const transferSelected = ref<number | null>(null);
const transferChecked = ref(false);
const responseText = ref("");
const selfAssessment = ref<Exclude<ExerciseResult, "unassessed"> | null>(null);
let draftTimer: ReturnType<typeof setTimeout> | undefined;

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const unit = computed(() =>
  learningUnits.find((item) => item.source === page.value.relativePath)
);
const generatedExerciseKey = computed(() =>
  `${page.value.relativePath}::${stableHash(props.question)}`
);
const exerciseKey = computed(() =>
  props.id || generatedExerciseKey.value
);
const transferKey = computed(() => `${exerciseKey.value}::transfer`);
const legacyExerciseKeys = computed(() => {
  const sources = [
    page.value.relativePath,
    ...legacyLessonAliases
      .filter((alias) => alias.source === page.value.relativePath)
      .map((alias) => alias.oldSource)
  ];
  return [...new Set(sources.map((source) => `${source}::${stableHash(props.question)}`))]
    .filter((id) => id !== exerciseKey.value);
});
const anchorId = computed(() => `exercise-${stableHash(exerciseKey.value)}`);
const questionId = computed(() => `${anchorId.value}-question`);
const choiceInstructionId = computed(() => `${anchorId.value}-choice-instruction`);
const answerId = computed(() => `${anchorId.value}-answer`);
const transferName = computed(() => `${anchorId.value}-transfer`);
const primaryName = computed(() => `${anchorId.value}-choice`);

const labels: Record<ExerciseType, string> = {
  qa: "问答题",
  choice: "选择题",
  calculation: "计算题"
};

const isMultipleChoice = computed(() => props.type === "choice" && props.multiple);
const typeLabel = computed(() => isMultipleChoice.value ? "多选题" : labels[props.type]);
const statusText = computed(() => {
  if (isMultipleChoice.value) return "选完后检查";
  if (props.type === "choice") return "选择后立即显示解析";
  return "先写答案，再对照解析";
});
const correctIndexes = computed(() =>
  [...new Set((props.correct.toUpperCase().match(/[A-Z]/g) ?? []).map(letterIndex))]
    .filter((index) => index >= 0 && index < props.options.length)
);
const correctIndex = computed(() => correctIndexes.value[0] ?? -1);
const transferCorrectIndex = computed(() => letterIndex(props.transfer?.correct ?? ""));
const transferIsCorrect = computed(() => transferSelected.value === transferCorrectIndex.value);
const storedExercise = computed(() => progress.getExercise(exerciseKey.value));
const storedResult = computed(() => storedExercise.value?.lastResult ?? "unassessed");
const transferPassed = computed(() => Boolean(storedExercise.value?.remediatedAt));
const transferFailed = computed(() =>
  storedExercise.value?.lastTransferResult === "incorrect" ||
  storedExercise.value?.lastTransferResult === "partial"
);
const activeMisconceptions = computed(() => {
  const transferExercise = props.transfer ? progress.getExercise(transferKey.value) : undefined;
  const ids = new Set([
    ...(storedExercise.value?.misconceptionIds ?? []),
    ...(transferExercise?.misconceptionIds ?? [])
  ]);
  return props.misconceptions.filter((item) => ids.has(item.id));
});
const needsRemediation = computed(() =>
  Boolean(props.remediation) && (
    storedResult.value === "incorrect" ||
    storedResult.value === "partial" ||
    storedExercise.value?.lastTransferResult === "incorrect"
  ) && !transferPassed.value
);
const resultLabel = computed(() => ({
  unassessed: "未作答",
  correct: "答对",
  partial: "部分正确",
  incorrect: "待复习"
}[transferPassed.value ? "correct" : storedResult.value]));
const displayedResultLabel = computed(() => {
  if (transferPassed.value) return "迁移通过";
  if (transferFailed.value) return "迁移待巩固";
  return resultLabel.value;
});
const displayedResult = computed(() => {
  if (transferPassed.value) return "correct";
  if (transferFailed.value) return "incorrect";
  return storedResult.value;
});
const answerButtonText = computed(() => {
  if (revealed.value) return "隐藏解析";
  return isMultipleChoice.value ? "检查答案" : "显示答案";
});

function letterIndex(value: string) {
  return value.toUpperCase().charCodeAt(0) - 65;
}

function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function exerciseMeta(id: string, question: string, type: string, transfer = false) {
  return {
    id,
    lessonSource: page.value.relativePath,
    question,
    type,
    href: unit.value?.href ?? "",
    anchor: anchorId.value,
    kind: transfer ? "transfer" as const : "primary" as const,
    parentId: transfer ? exerciseKey.value : undefined,
    concepts: props.concepts,
    misconceptions: props.misconceptions,
    remediation: props.remediation ?? undefined,
    requiresTransfer: !transfer && Boolean(props.transfer),
    legacyIds: legacyExerciseKeys.value.map((id) => transfer ? `${id}::transfer` : id)
  };
}

function registerExercises() {
  if (!unit.value) return;
  progress.registerExercise(exerciseMeta(exerciseKey.value, props.question, props.type));
  if (props.transfer) {
    progress.registerExercise(exerciseMeta(transferKey.value, props.transfer.question, "transfer", true));
  }
}

function restoreState() {
  const stored = progress.getExercise(exerciseKey.value);
  if (!stored) return;
  const reviewId = new URL(window.location.href).searchParams.get("review");
  const reviewingPrimary = reviewId === exerciseKey.value || legacyExerciseKeys.value.includes(reviewId ?? "");
  if (!reviewingPrimary) {
    responseText.value = stored.draft ?? stored.response ?? "";
    if (props.multiple) {
      selectedIndexes.value = [...(stored.selected ?? [])];
      attemptedIndexes.value = [...(stored.selected ?? [])];
    } else if (stored.selected?.length) {
      selectedIndex.value = stored.selected[0];
      attemptedIndex.value = stored.selected[0];
    }
    selfAssessment.value = stored.lastResult === "unassessed" ? null : stored.lastResult;
  }
  revealed.value = stored.attempts > 0 && !reviewingPrimary;

  const transferStored = props.transfer ? progress.getExercise(transferKey.value) : null;
  const reviewingTransfer = reviewId === transferKey.value || legacyExerciseKeys.value
    .map((id) => `${id}::transfer`)
    .includes(reviewId ?? "");
  if (transferStored?.selected?.length && !reviewingTransfer) {
    transferSelected.value = transferStored.selected[0];
    transferChecked.value = transferStored.attempts > 0;
  }
}

function detectedMisconceptionIds(
  result: Exclude<ExerciseResult, "unassessed">,
  selected: number[] = []
) {
  if (result === "correct") return [];
  const selectedLetters = new Set(selected.map(optionLetter));
  const matched = props.misconceptions.filter((item) =>
    !item.options?.length || item.options.some((option) => selectedLetters.has(option.toUpperCase()))
  );
  return (matched.length ? matched : props.misconceptions).map((item) => item.id);
}

function recordPrimary(result: Exclude<ExerciseResult, "unassessed">, selected?: number[]) {
  progress.recordExerciseResult(exerciseKey.value, result, {
    response: responseText.value.trim() || undefined,
    selected,
    misconceptionIds: detectedMisconceptionIds(result, selected)
  });
}

function revealSingleChoice() {
  attemptedIndex.value = selectedIndex.value;
  const result = attemptedIndex.value === correctIndex.value ? "correct" : "incorrect";
  recordPrimary(result, attemptedIndex.value === null ? [] : [attemptedIndex.value]);
  revealed.value = true;
}

function selectSingleChoice(index: number) {
  if (revealed.value) return;
  selectedIndex.value = index;
  revealSingleChoice();
}

function revealMultipleChoice() {
  attemptedIndexes.value = [...selectedIndexes.value];
  const correct =
    attemptedIndexes.value.length === correctIndexes.value.length &&
    attemptedIndexes.value.every((index) => correctIndexes.value.includes(index));
  recordPrimary(correct ? "correct" : "incorrect", attemptedIndexes.value);
  revealed.value = true;
}

function toggleAnswer() {
  if (revealed.value) {
    revealed.value = false;
    return;
  }

  if (isMultipleChoice.value) revealMultipleChoice();
  else if (props.type === "choice") revealSingleChoice();
  else {
    const hasResponse = Boolean(responseText.value.trim());
    if (!hasResponse) {
      selfAssessment.value = "incorrect";
      recordPrimary("incorrect");
    }
    revealed.value = true;
  }
}

function assess(result: Exclude<ExerciseResult, "unassessed">) {
  if (selfAssessment.value !== null) return;
  selfAssessment.value = result;
  recordPrimary(result);
}

function checkTransfer() {
  transferChecked.value = transferSelected.value !== null;
  if (!transferChecked.value) return;
  progress.recordExerciseResult(
    transferKey.value,
    transferIsCorrect.value ? "correct" : "incorrect",
    {
      selected: [transferSelected.value as number],
      misconceptionIds: transferIsCorrect.value ? [] : props.misconceptions.map((item) => item.id)
    }
  );
}

function resetForRetry() {
  revealed.value = false;
  selectedIndex.value = null;
  attemptedIndex.value = null;
  selectedIndexes.value = [];
  attemptedIndexes.value = [];
  transferSelected.value = null;
  transferChecked.value = false;
  responseText.value = "";
  selfAssessment.value = null;
  progress.saveExerciseDraft(exerciseKey.value, "");
}

watch(responseText, (value) => {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => progress.saveExerciseDraft(exerciseKey.value, value), 350);
});

onMounted(() => {
  initializeProgress();
  registerExercises();
  restoreState();
});

onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer);
  progress.saveExerciseDraft(exerciseKey.value, responseText.value);
});
</script>

<template>
  <article
    :id="anchorId"
    class="exercise-block"
    :class="[`exercise-${type}`, `result-${displayedResult}`]"
  >
    <span
      v-for="legacyKey in legacyExerciseKeys"
      :id="`exercise-${stableHash(legacyKey)}`"
      :key="legacyKey"
      class="exercise-legacy-anchor"
      aria-hidden="true"
    />
    <div class="exercise-heading">
      <span class="exercise-type">{{ typeLabel }}</span>
      <span class="exercise-status">{{ statusText }}</span>
      <span v-if="storedResult !== 'unassessed'" class="exercise-saved-result">{{ displayedResultLabel }}</span>
    </div>

    <p v-if="concepts.length" class="exercise-concepts" aria-label="本题检测概念">
      <span>检测</span>{{ concepts.map((concept) => concept.label).join(" · ") }}
    </p>

    <p :id="questionId" class="exercise-question">{{ question }}</p>

    <fieldset
      v-if="type === 'choice'"
      class="exercise-options"
      :aria-labelledby="`${questionId} ${choiceInstructionId}`"
    >
      <legend :id="choiceInstructionId" class="sr-only">{{ isMultipleChoice ? "请选择一个或多个答案" : "请选择一个答案" }}</legend>
      <label
        v-for="(option, index) in options"
        :key="`${exerciseKey}-${index}`"
        class="exercise-option"
        :class="{
          correct: revealed && correctIndexes.includes(index),
          attempted: revealed && (
            isMultipleChoice
              ? attemptedIndexes.includes(index) && !correctIndexes.includes(index)
              : index === attemptedIndex && attemptedIndex !== correctIndex
          )
        }"
      >
        <input
          v-if="isMultipleChoice"
          v-model="selectedIndexes"
          type="checkbox"
          :value="index"
          :disabled="revealed"
        >
        <input
          v-else
          v-model="selectedIndex"
          type="radio"
          :name="primaryName"
          :value="index"
          :disabled="revealed"
          @change="selectSingleChoice(index)"
        >
        <span class="exercise-option-letter">{{ optionLetter(index) }}</span>
        <span>{{ option }}</span>
      </label>
    </fieldset>

    <textarea
      v-else-if="type === 'qa'"
      v-model="responseText"
      class="exercise-response exercise-response-long"
      rows="4"
      placeholder="先写下自己的答案"
      :aria-labelledby="questionId"
      :disabled="revealed"
    />
    <input
      v-else
      v-model="responseText"
      class="exercise-response"
      type="text"
      inputmode="decimal"
      placeholder="先写下计算结果"
      :aria-labelledby="questionId"
      :disabled="revealed"
    >

    <button
      class="exercise-answer-button"
      type="button"
      :aria-expanded="revealed"
      :aria-controls="answerId"
      :disabled="isMultipleChoice && !revealed && selectedIndexes.length === 0"
      @click="toggleAnswer"
    >
      {{ answerButtonText }}
    </button>

    <section v-show="revealed" :id="answerId" class="exercise-answer" aria-live="polite">
      <p v-if="isMultipleChoice" class="exercise-attempt-note">
        <template v-if="attemptedIndexes.length === correctIndexes.length && attemptedIndexes.every((index) => correctIndexes.includes(index))">
          你选择了 {{ attemptedIndexes.map(optionLetter).join("、") }}，判断正确。
        </template>
        <template v-else>
          你选择了 {{ attemptedIndexes.map(optionLetter).join("、") || "未选择" }}；正确答案是
          {{ correctIndexes.map(optionLetter).join("、") }}，现已标出。
        </template>
      </p>
      <p v-else-if="type === 'choice' && attemptedIndex !== null" class="exercise-attempt-note">
        <template v-if="attemptedIndex === correctIndex">
          你原先选择了 {{ optionLetter(attemptedIndex) }}，判断正确。
        </template>
        <template v-else>
          你原先选择了 {{ optionLetter(attemptedIndex) }}；正确答案是 {{ optionLetter(correctIndex) }}。
        </template>
      </p>
      <p v-else-if="type === 'choice'" class="exercise-attempt-note">
        你还没有选择；正确答案是 {{ optionLetter(correctIndex) }}。
      </p>

      <div class="exercise-answer-result" aria-label="答案">
        <p>{{ answer }}</p>
      </div>

      <div v-if="type !== 'choice'" class="exercise-self-assessment" aria-label="自评结果">
        <span>对照结果</span>
        <button type="button" :disabled="selfAssessment !== null" :class="{ active: selfAssessment === 'correct' }" @click="assess('correct')">答对了</button>
        <button type="button" :disabled="selfAssessment !== null" :class="{ active: selfAssessment === 'partial' }" @click="assess('partial')">部分正确</button>
        <button type="button" :disabled="selfAssessment !== null" :class="{ active: selfAssessment === 'incorrect' }" @click="assess('incorrect')">没答出来</button>
      </div>

      <section class="exercise-reasoning" aria-label="详细推理过程">
        <h3>详细推理</h3>
        <ol>
          <li v-for="(step, index) in steps" :key="step" class="exercise-reasoning-step">
            <span>第 {{ index + 1 }} 步</span>
            <p>{{ step }}</p>
          </li>
        </ol>
        <p v-if="mistake" class="exercise-mistake"><strong>易错点：</strong>{{ mistake }}</p>
      </section>

      <section v-if="needsRemediation" class="exercise-remediation" aria-label="针对性补救">
        <p class="exercise-remediation-label">这次暴露的误解</p>
        <ul>
          <li v-for="item in activeMisconceptions" :key="item.id">
            <strong>{{ item.label }}</strong>
            <span>{{ item.explanation }}</span>
          </li>
        </ul>
        <p v-if="remediation">
          <span>{{ remediation.reason }}</span>
          <a :href="remediation.href">回到“{{ remediation.title }}”</a>
        </p>
        <small>补完后完成下面的迁移题，概念才进入间隔复习。</small>
      </section>

      <p
        v-else-if="transfer && storedResult !== 'unassessed' && !transferPassed"
        class="exercise-transfer-gate"
      >
        主问题已经完成。再换一个场景验证，避免只记住原题答案。
      </p>

      <div v-if="compare.length" class="exercise-compare" role="table" aria-label="概念对照">
        <div class="exercise-compare-row exercise-compare-head" role="row">
          <span role="columnheader">对比</span>
          <span role="columnheader">{{ compareHeaders[0] }}</span>
          <span role="columnheader">{{ compareHeaders[1] }}</span>
        </div>
        <div v-for="row in compare" :key="row.label" class="exercise-compare-row" role="row">
          <strong role="rowheader">{{ row.label }}</strong>
          <span role="cell">{{ row.left }}</span>
          <span role="cell">{{ row.right }}</span>
        </div>
      </div>

      <div v-if="flow.length" class="exercise-mini-flow" aria-label="关系链">
        <template v-for="(item, index) in flow" :key="item">
          <span>{{ item }}</span>
          <b v-if="index < flow.length - 1" aria-hidden="true">→</b>
        </template>
      </div>

      <fieldset v-if="transfer" class="exercise-transfer" :class="{ passed: transferPassed }">
        <legend>
          <span>{{ transferPassed ? "迁移已通过" : needsRemediation ? "补救后迁移重测" : "马上换个场景" }}</span>
          {{ transfer.question }}
        </legend>
        <p v-if="storedResult === 'unassessed'" class="exercise-transfer-wait">
          先完成上面的作答与自评，再做这道迁移题。
        </p>
        <label v-for="(option, index) in transfer.options" :key="option" class="exercise-transfer-option">
          <input
            v-model="transferSelected"
            type="radio"
            :name="transferName"
            :value="index"
            :disabled="transferChecked || storedResult === 'unassessed'"
            @change="checkTransfer"
          >
          <span>{{ optionLetter(index) }}. {{ option }}</span>
        </label>
        <p v-if="transferChecked" class="exercise-transfer-feedback" :class="{ correct: transferIsCorrect }">
          {{ transferIsCorrect ? "答对了。" : `正确答案是 ${optionLetter(transferCorrectIndex)}。` }}
          {{ transfer.explanation }}
        </p>
      </fieldset>

      <button type="button" class="exercise-retry-button" @click="resetForRetry">重新作答</button>
    </section>
  </article>
</template>
