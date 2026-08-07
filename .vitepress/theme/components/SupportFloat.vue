<script setup lang="ts">
import { withBase } from "vitepress";
</script>

<template>
  <a
    class="support-float"
    :href="withBase('/08-支持课程/')"
    aria-label="支持课程"
    title="支持课程"
  >
    <span aria-hidden="true">赏</span>
    <span class="visually-hidden">支持课程</span>
  </a>
</template>
