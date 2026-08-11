<script lang="ts">
let mermaidModulePromise: Promise<typeof import("mermaid")> | undefined;
let mermaidRenderQueue: Promise<void> = Promise.resolve();

function loadMermaid() {
  mermaidModulePromise ??= import("mermaid").catch((reason) => {
    mermaidModulePromise = undefined;
    throw reason;
  });
  return mermaidModulePromise;
}
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ code: string }>();
const host = ref<HTMLElement | null>(null);
const error = ref("");
const hasDiagram = ref(false);
const loading = ref(true);
let observer: MutationObserver | undefined;
let renderVersion = 0;

function decode(value: string) {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function renderDiagram() {
  const version = ++renderVersion;
  const target = host.value;
  if (!target) return;

  error.value = "";
  loading.value = true;
  const source = decode(props.code);
  const dark = document.documentElement.classList.contains("dark");

  const task = async () => {
    const { default: mermaid } = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "neutral",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    });
    await mermaid.parse(source);
    const id = `llmtrain-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { svg, bindFunctions } = await mermaid.render(id, source);
    if (version !== renderVersion || !host.value) return;
    host.value.innerHTML = svg;
    bindFunctions?.(host.value);
    hasDiagram.value = true;
    loading.value = false;
  };

  mermaidRenderQueue = mermaidRenderQueue.then(task, task);
  try {
    await mermaidRenderQueue;
  } catch (reason) {
    if (version !== renderVersion) return;
    loading.value = false;
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}

onMounted(() => {
  observer = new MutationObserver(renderDiagram);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
  void renderDiagram();
});

onBeforeUnmount(() => {
  renderVersion += 1;
  observer?.disconnect();
});
</script>

<template>
  <figure class="mermaid-figure">
    <div class="mermaid-stage">
      <div ref="host" class="mermaid-canvas" aria-label="课程流程图" :aria-busy="loading" />
      <p v-if="loading && !hasDiagram" class="mermaid-status" role="status">
        流程图加载中…
      </p>
    </div>
    <figcaption v-if="error" class="mermaid-error">
      图表解析失败：{{ error }}
    </figcaption>
  </figure>
</template>
