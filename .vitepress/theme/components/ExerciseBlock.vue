<script setup lang="ts">
import { computed, ref, useId } from "vue";

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
  }>(),
  {
    options: () => [],
    correct: "",
    multiple: false,
    mistake: "",
    compareHeaders: () => [],
    compare: () => [],
    flow: () => [],
    transfer: null
  }
);

const instanceId = useId().replaceAll(":", "");
const revealed = ref(false);
const selectedIndex = ref<number | null>(null);
const attemptedIndex = ref<number | null>(null);
const selectedIndexes = ref<number[]>([]);
const attemptedIndexes = ref<number[]>([]);
const transferSelected = ref<number | null>(null);
const transferChecked = ref(false);

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
  return "先作答，再显示解析";
});
const correctIndexes = computed(() =>
  [...new Set((props.correct.toUpperCase().match(/[A-Z]/g) ?? []).map(letterIndex))]
    .filter((index) => index >= 0 && index < props.options.length)
);
const correctIndex = computed(() => correctIndexes.value[0] ?? -1);
const transferCorrectIndex = computed(() => letterIndex(props.transfer?.correct ?? ""));
const transferIsCorrect = computed(() => transferSelected.value === transferCorrectIndex.value);
const answerId = computed(() => `exercise-answer-${instanceId}`);
const transferName = computed(() => `exercise-transfer-${instanceId}`);
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

function resetAnswerState() {
  transferSelected.value = null;
  transferChecked.value = false;
}

function revealSingleChoice() {
  attemptedIndex.value = selectedIndex.value;
  if (correctIndex.value >= 0) {
    selectedIndex.value = correctIndex.value;
  }
  revealed.value = true;
}

function selectSingleChoice(index: number) {
  if (revealed.value) return;
  selectedIndex.value = index;
  revealSingleChoice();
}

function revealMultipleChoice() {
  attemptedIndexes.value = [...selectedIndexes.value];
  selectedIndexes.value = [...correctIndexes.value];
  revealed.value = true;
}

function toggleAnswer() {
  if (revealed.value) {
    revealed.value = false;
    if (isMultipleChoice.value) selectedIndexes.value = [...attemptedIndexes.value];
    else if (props.type === "choice") selectedIndex.value = attemptedIndex.value;
    resetAnswerState();
    return;
  }

  if (isMultipleChoice.value) revealMultipleChoice();
  else if (props.type === "choice") revealSingleChoice();
  else revealed.value = true;
}

function checkTransfer() {
  transferChecked.value = transferSelected.value !== null;
}
</script>

<template>
  <article class="exercise-block" :class="`exercise-${type}`">
    <div class="exercise-heading">
      <span class="exercise-type">{{ typeLabel }}</span>
      <span class="exercise-status">{{ statusText }}</span>
    </div>

    <p class="exercise-question">{{ question }}</p>

    <fieldset v-if="type === 'choice'" class="exercise-options">
      <legend class="sr-only">{{ isMultipleChoice ? "请选择一个或多个答案" : "请选择一个答案" }}</legend>
      <label
        v-for="(option, index) in options"
        :key="`${instanceId}-${index}`"
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
          :name="`exercise-${instanceId}`"
          :value="index"
          :disabled="revealed"
          @change="selectSingleChoice(index)"
        >
        <span class="exercise-option-letter">{{ optionLetter(index) }}</span>
        <span>{{ option }}</span>
      </label>
    </fieldset>

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
          你选择了 {{ attemptedIndexes.map(optionLetter).join("、") }}；正确答案是
          {{ correctIndexes.map(optionLetter).join("、") }}，现已标出。
        </template>
      </p>
      <p v-else-if="type === 'choice' && attemptedIndex !== null" class="exercise-attempt-note">
        <template v-if="attemptedIndex === correctIndex">
          你原先选择了 {{ optionLetter(attemptedIndex) }}，判断正确。
        </template>
        <template v-else>
          你原先选择了 {{ optionLetter(attemptedIndex) }}；现在已自动勾选正确答案
          {{ optionLetter(correctIndex) }}。
        </template>
      </p>
      <p v-else-if="type === 'choice'" class="exercise-attempt-note">
        你还没有选择；现在已自动勾选正确答案 {{ optionLetter(correctIndex) }}。
      </p>

      <div class="exercise-answer-result">
        <strong>答案</strong>
        <p>{{ answer }}</p>
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

      <fieldset v-if="transfer" class="exercise-transfer">
        <legend><span>马上换个场景</span>{{ transfer.question }}</legend>
        <label v-for="(option, index) in transfer.options" :key="option" class="exercise-transfer-option">
          <input
            v-model="transferSelected"
            type="radio"
            :name="transferName"
            :value="index"
            :disabled="transferChecked"
            @change="checkTransfer"
          >
          <span>{{ optionLetter(index) }}. {{ option }}</span>
        </label>
        <p v-if="transferChecked" class="exercise-transfer-feedback" :class="{ correct: transferIsCorrect }">
          {{ transferIsCorrect ? "答对了。" : `正确答案是 ${optionLetter(transferCorrectIndex)}。` }}
          {{ transfer.explanation }}
        </p>
      </fieldset>

    </section>
  </article>
</template>
