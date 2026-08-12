<script setup lang="ts">
import { computed } from "vue";

type StoryTone = "blue" | "green" | "orange" | "rose" | "slate";
type StoryNode = {
  label: string;
  name: string;
  detail: string;
  tone?: StoryTone;
  arrow?: string;
};
type StorySpec = {
  ariaLabel: string;
  title: string;
  goal: string;
  pattern: "flow" | "branch" | "merge";
  source?: StoryNode;
  items: StoryNode[];
  result?: StoryNode;
  example: { label: string; text: string };
  counterfactual: { label: string; text: string };
  boundary?: string;
};

const props = defineProps<{ spec: string }>();
const story = computed<StorySpec>(() => JSON.parse(decodeURIComponent(props.spec)));
const branchStyle = computed(() => ({
  "--formula-story-columns": Math.min(Math.max(story.value.items.length, 1), 4),
}));

function tone(node?: StoryNode) {
  return `tone-${node?.tone ?? "blue"}`;
}
</script>

<template>
  <figure class="formula-story" :class="`is-${story.pattern}`" :aria-label="story.ariaLabel">
    <header class="formula-story-header">
      <span class="formula-story-kicker">把公式画开</span>
      <div>
        <h3>{{ story.title }}</h3>
        <p>{{ story.goal }}</p>
      </div>
    </header>

    <div class="formula-story-scene">
      <template v-if="story.pattern === 'flow'">
        <div v-if="story.source" class="formula-story-node is-source" :class="tone(story.source)">
          <strong>{{ story.source.label }}</strong>
          <span>{{ story.source.name }}</span>
          <small>{{ story.source.detail }}</small>
        </div>
        <template v-for="(item, index) in story.items" :key="`${item.label}-${index}`">
          <div class="formula-story-connector" aria-hidden="true">
            <span>{{ item.arrow ?? '然后' }}</span>
            <i />
          </div>
          <div class="formula-story-node" :class="tone(item)">
            <strong>{{ item.label }}</strong>
            <span>{{ item.name }}</span>
            <small>{{ item.detail }}</small>
          </div>
        </template>
        <template v-if="story.result">
          <div class="formula-story-connector" aria-hidden="true">
            <span>{{ story.result.arrow ?? '得到' }}</span>
            <i />
          </div>
          <div class="formula-story-node is-result" :class="tone(story.result)">
            <strong>{{ story.result.label }}</strong>
            <span>{{ story.result.name }}</span>
            <small>{{ story.result.detail }}</small>
          </div>
        </template>
      </template>

      <template v-else-if="story.pattern === 'branch'">
        <div v-if="story.source" class="formula-story-node is-source is-branch-source" :class="tone(story.source)">
          <strong>{{ story.source.label }}</strong>
          <span>{{ story.source.name }}</span>
          <small>{{ story.source.detail }}</small>
        </div>
        <div class="formula-story-branch-line" aria-hidden="true"><i /></div>
        <div class="formula-story-branches" :style="branchStyle">
          <div v-for="(item, index) in story.items" :key="`${item.label}-${index}`" class="formula-story-branch">
            <div class="formula-story-branch-arrow" aria-hidden="true"><span>{{ item.arrow ?? '分别投影' }}</span><i /></div>
            <div class="formula-story-node" :class="tone(item)">
              <strong>{{ item.label }}</strong>
              <span>{{ item.name }}</span>
              <small>{{ item.detail }}</small>
            </div>
          </div>
        </div>
        <div v-if="story.result" class="formula-story-result-note" :class="tone(story.result)">
          <strong>{{ story.result.label }}</strong>
          <span>{{ story.result.name }}：{{ story.result.detail }}</span>
        </div>
      </template>

      <template v-else>
        <div class="formula-story-branches is-merge-sources" :style="branchStyle">
          <div v-for="(item, index) in story.items" :key="`${item.label}-${index}`" class="formula-story-branch">
            <div class="formula-story-node" :class="tone(item)">
              <strong>{{ item.label }}</strong>
              <span>{{ item.name }}</span>
              <small>{{ item.detail }}</small>
            </div>
            <div class="formula-story-branch-arrow is-down" aria-hidden="true"><span>{{ item.arrow ?? '共同进入' }}</span><i /></div>
          </div>
        </div>
        <div class="formula-story-branch-line is-merge" aria-hidden="true"><i /></div>
        <div v-if="story.result" class="formula-story-node is-result is-merge-result" :class="tone(story.result)">
          <strong>{{ story.result.label }}</strong>
          <span>{{ story.result.name }}</span>
          <small>{{ story.result.detail }}</small>
        </div>
      </template>
    </div>

    <div class="formula-story-evidence">
      <p class="is-example"><strong>{{ story.example.label }}</strong><span>{{ story.example.text }}</span></p>
      <p class="is-counterfactual"><strong>{{ story.counterfactual.label }}</strong><span>{{ story.counterfactual.text }}</span></p>
    </div>
    <figcaption v-if="story.boundary"><strong>边界</strong>{{ story.boundary }}</figcaption>
  </figure>
</template>
