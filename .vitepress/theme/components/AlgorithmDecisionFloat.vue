<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vitepress";

const route = useRoute();
const isAlgorithmChapter = computed(() => {
  try {
    return /^\/09-模型算法图解\/(?:0[1-9]|1[0-9]|2[0-4])-/.test(decodeURIComponent(route.path));
  } catch {
    return false;
  }
});
</script>

<template>
  <a
    v-if="isAlgorithmChapter"
    class="algorithm-decision-float"
    href="#采用判断"
    aria-label="跳到本章采用判断"
    title="跳到本章采用判断"
  >
    <span>采用判断</span>
  </a>
</template>

<style scoped>
.algorithm-decision-float {
  position: fixed;
  z-index: 40;
  top: calc(58% - 156px);
  right: env(safe-area-inset-right);
  display: grid;
  width: 32px;
  height: 80px;
  padding: 9px 0 15px;
  place-items: center;
  clip-path: polygon(0 0, 100% 0, 100% 88%, 50% 100%, 0 88%);
  color: #fff !important;
  background: var(--vp-c-brand-1);
  box-shadow: 0 8px 22px rgba(18, 110, 99, 0.24);
  font-size: 13px;
  font-weight: 760;
  line-height: 1;
  text-decoration: none !important;
  transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.algorithm-decision-float > span {
  writing-mode: vertical-rl;
  text-orientation: upright;
}

.algorithm-decision-float:hover,
.algorithm-decision-float:focus-visible {
  background: var(--vp-c-brand-2);
  box-shadow: 0 10px 26px rgba(18, 110, 99, 0.32);
  transform: translateY(-2px);
}

.algorithm-decision-float:focus-visible {
  outline: 3px solid var(--vp-c-brand-soft);
  outline-offset: 3px;
}

@media (max-width: 760px) {
  :global(.Layout:has(.algorithm-decision-float) .VPDoc) {
    padding-right: calc(46px + env(safe-area-inset-right));
  }

  .algorithm-decision-float {
    top: auto;
    right: env(safe-area-inset-right);
    bottom: calc(176px + env(safe-area-inset-bottom));
    width: 38px;
    height: 70px;
    padding: 7px 0 13px;
    font-size: 11px;
  }

  .algorithm-decision-float:hover,
  .algorithm-decision-float:focus-visible {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .algorithm-decision-float {
    scroll-behavior: auto;
    transition: none;
  }
}
</style>
