<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ code: string }>();
const host = ref<HTMLElement | null>(null);
const error = ref("");
let observer: MutationObserver | undefined;
let renderVersion = 0;
let renderQueue = Promise.resolve();

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
  target.replaceChildren();
  const source = decode(props.code);
  const dark = document.documentElement.classList.contains("dark");

  const task = async () => {
    const { default: mermaid } = await import("mermaid");
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
  };

  renderQueue = renderQueue.then(task, task);
  try {
    await renderQueue;
  } catch (reason) {
    if (version !== renderVersion) return;
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
    <div ref="host" class="mermaid-canvas" aria-label="课程流程图" />
    <figcaption v-if="error" class="mermaid-error">
      图表解析失败：{{ error }}
    </figcaption>
  </figure>
</template>
