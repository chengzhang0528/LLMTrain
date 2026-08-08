<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { withBase } from "vitepress";

type CurriculumItem = {
  title: string;
  summary: string;
  href: string;
  level: string;
  output: string;
};

type CurriculumAxis = {
  id: string;
  label: string;
  question: string;
  items: CurriculumItem[];
};

const props = defineProps<{ axes: CurriculumAxis[] }>();
const activeId = ref(props.axes[0]?.id ?? "");
const activeAxis = computed(
  () => props.axes.find((axis) => axis.id === activeId.value) ?? props.axes[0]
);

function selectAxis(id: string) {
  activeId.value = id;
}

async function moveFocus(event: KeyboardEvent, index: number) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key) || !props.axes.length) return;
  event.preventDefault();

  let nextIndex = index;
  if (event.key === "ArrowLeft") nextIndex = (index - 1 + props.axes.length) % props.axes.length;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % props.axes.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = props.axes.length - 1;

  activeId.value = props.axes[nextIndex].id;
  await nextTick();
  document.getElementById(`curriculum-tab-${props.axes[nextIndex].id}`)?.focus();
}
</script>

<template>
  <section class="curriculum-explorer" aria-labelledby="curriculum-explorer-title">
    <div class="curriculum-explorer-heading">
      <div>
        <p class="curriculum-explorer-kicker">课程学科地图</p>
        <h2 id="curriculum-explorer-title">从四个角度进入同一套知识</h2>
      </div>
      <p v-if="activeAxis" class="curriculum-axis-question" aria-live="polite">
        {{ activeAxis.question }}
      </p>
    </div>

    <div class="curriculum-axis-tabs" role="tablist" aria-label="课程浏览角度">
      <button
        v-for="(axis, index) in axes"
        :id="`curriculum-tab-${axis.id}`"
        :key="axis.id"
        type="button"
        role="tab"
        :aria-controls="`curriculum-panel-${axis.id}`"
        :aria-selected="activeId === axis.id"
        :tabindex="activeId === axis.id ? 0 : -1"
        @click="selectAxis(axis.id)"
        @keydown="moveFocus($event, index)"
      >
        {{ axis.label }}
      </button>
    </div>

    <div
      v-if="activeAxis"
      :id="`curriculum-panel-${activeAxis.id}`"
      class="curriculum-axis-panel"
      role="tabpanel"
      :aria-labelledby="`curriculum-tab-${activeAxis.id}`"
    >
      <div class="curriculum-track-list" role="list">
        <div v-for="(item, index) in activeAxis.items" :key="item.href" role="listitem">
          <a :href="withBase(item.href)">
            <span class="curriculum-item-index">{{ String(index + 1).padStart(2, "0") }}</span>
            <span class="curriculum-item-copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.summary }}</span>
            </span>
            <span class="curriculum-item-meta">
              <span>{{ item.level }}</span>
              <small>{{ item.output }}</small>
            </span>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
