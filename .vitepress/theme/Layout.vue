<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vitepress";
import DefaultTheme from "vitepress/theme";
import AlgorithmDecisionFloat from "./components/AlgorithmDecisionFloat.vue";
import FeedbackFloat from "./components/FeedbackFloat.vue";
import LearningDashboard from "./components/LearningDashboard.vue";
import LessonToolbar from "./components/LessonToolbar.vue";
import SupportFloat from "./components/SupportFloat.vue";

const route = useRoute();
const isHome = computed(() => route.path === "/");
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <LearningDashboard v-if="isHome" />
    </template>
    <template #doc-footer-before>
      <LessonToolbar />
    </template>
    <template #layout-bottom>
      <AlgorithmDecisionFloat />
      <FeedbackFloat />
      <SupportFloat />
    </template>
  </DefaultTheme.Layout>
</template>
