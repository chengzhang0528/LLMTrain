<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

type FormulaReadingItem = {
  expression: string;
  reading: string;
  breakdown: string;
  meaning: string;
  speech: string;
  audio: string;
};

type FormulaReadingSpec = {
  ariaLabel: string;
  title: string;
  intro: string;
  items: FormulaReadingItem[];
};

const props = defineProps<{ spec: string }>();
const scene = computed<FormulaReadingSpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const activeIndex = ref<number | null>(null);

let activeAudio: HTMLAudioElement | null = null;
let speechRequest = 0;
const speechEvent = "llmtrain:speech-start";

function finish(request: number) {
  if (request !== speechRequest) return;
  activeIndex.value = null;
  activeAudio = null;
}

function stop() {
  speechRequest += 1;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  activeIndex.value = null;
}

function playAudio(item: FormulaReadingItem, request: number) {
  if (request !== speechRequest) return;
  const path = `${import.meta.env.BASE_URL}${item.audio.replace(/^\//, "")}`;
  const audio = new Audio(path);
  activeAudio = audio;
  audio.onended = () => finish(request);
  audio.onerror = () => finish(request);
  audio.play().catch(() => finish(request));
}

function play(index: number) {
  if (activeIndex.value === index) {
    stop();
    return;
  }

  stop();
  const item = scene.value.items[index];
  const request = speechRequest;
  activeIndex.value = index;
  window.dispatchEvent(new CustomEvent(speechEvent, { detail: { source: "formula-reading" } }));

  if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
    const voices = window.speechSynthesis.getVoices();
    const chineseVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("zh"));
    if (chineseVoice) {
      const utterance = new SpeechSynthesisUtterance(item.speech);
      utterance.lang = "zh-CN";
      utterance.voice = chineseVoice;
      utterance.rate = 0.78;
      utterance.onend = () => finish(request);
      utterance.onerror = () => {
        if (request === speechRequest) playAudio(item, request);
      };
      window.speechSynthesis.speak(utterance);
      return;
    }
  }

  playAudio(item, request);
}

function onOtherSpeech(event: Event) {
  if ((event as CustomEvent<{ source?: string }>).detail?.source !== "formula-reading") stop();
}

if (typeof window !== "undefined") window.addEventListener(speechEvent, onOtherSpeech);
onBeforeUnmount(() => {
  stop();
  window.removeEventListener(speechEvent, onOtherSpeech);
});
</script>

<template>
  <figure class="formula-reading" :aria-label="scene.ariaLabel">
    <figcaption class="formula-reading-header">
      <strong>{{ scene.title }}</strong>
      <span>{{ scene.intro }}</span>
    </figcaption>

    <div class="formula-reading-list">
      <article
        v-for="(item, index) in scene.items"
        :key="item.expression"
        class="formula-reading-row"
        :class="{ 'is-speaking': activeIndex === index }"
      >
        <div class="formula-reading-expression" aria-hidden="true">{{ item.expression }}</div>
        <div class="formula-reading-copy">
          <p><b>怎么念</b><strong>{{ item.reading }}</strong></p>
          <p><b>拆开看</b><span>{{ item.breakdown }}</span></p>
          <p><b>实际意思</b><span>{{ item.meaning }}</span></p>
        </div>
        <button
          type="button"
          class="formula-reading-play"
          :class="{ 'is-speaking': activeIndex === index }"
          :aria-label="`${activeIndex === index ? '停止朗读' : '朗读'}：${item.reading}`"
          :aria-pressed="activeIndex === index"
          :title="activeIndex === index ? '停止朗读' : `朗读：${item.reading}`"
          @click="play(index)"
        >
          <span aria-hidden="true">{{ activeIndex === index ? "■" : "▶" }}</span>
          <span>{{ activeIndex === index ? "停止" : "听老师领读" }}</span>
        </button>
      </article>
    </div>

    <p class="formula-reading-status" aria-live="polite" aria-atomic="true">
      {{ activeIndex === null ? "选择一行，只听表达式怎么念。" : `正在朗读：${scene.items[activeIndex].reading}` }}
    </p>
  </figure>
</template>
