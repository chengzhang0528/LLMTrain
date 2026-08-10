<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    direction?: "right" | "down";
    tone?: "process" | "change" | "neutral";
    active?: boolean;
    delayMs?: number;
  }>(),
  {
    direction: "right",
    tone: "process",
    active: true,
    delayMs: 0
  }
);
</script>

<template>
  <div
    class="pencil-action-arrow"
    :class="[`is-${direction}`, `tone-${tone}`, { 'is-active': active }]"
    :style="{ '--action-arrow-delay': `${delayMs}ms` }"
    role="img"
    :aria-label="label"
  >
    <span>{{ label }}</span>
    <i aria-hidden="true"><b></b></i>
  </div>
</template>

<style scoped>
.pencil-action-arrow {
  --action-arrow-color: var(--pencil-process);
  display: grid;
  min-width: 0;
  place-items: center;
  gap: 5px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.3;
  letter-spacing: 0;
  text-align: center;
}
.pencil-action-arrow.tone-change { --action-arrow-color: var(--pencil-change); }
.pencil-action-arrow.tone-neutral { --action-arrow-color: var(--vp-c-text-2); }
.pencil-action-arrow span {
  max-width: 100%;
  overflow-wrap: anywhere;
}
.pencil-action-arrow i {
  position: relative;
  display: block;
  color: var(--action-arrow-color);
}
.pencil-action-arrow i::after {
  position: absolute;
  width: 7px;
  height: 7px;
  border-top: 2px solid currentcolor;
  border-right: 2px solid currentcolor;
  content: "";
}
.pencil-action-arrow b {
  position: absolute;
  display: block;
  background: currentcolor;
  transform-origin: left center;
}
.pencil-action-arrow.is-right {
  grid-template-rows: minmax(26px, auto) 12px;
}
.pencil-action-arrow.is-right i {
  width: 100%;
  min-width: 42px;
  height: 2px;
}
.pencil-action-arrow.is-right i::after {
  top: -3px;
  right: 1px;
  transform: rotate(45deg);
}
.pencil-action-arrow.is-right b {
  inset: 0 8px 0 0;
  transform: scaleX(0);
}
.pencil-action-arrow.is-down {
  grid-template-rows: auto 28px;
}
.pencil-action-arrow.is-down i {
  width: 2px;
  height: 28px;
}
.pencil-action-arrow.is-down i::after {
  bottom: 1px;
  left: -3px;
  transform: rotate(135deg);
}
.pencil-action-arrow.is-down b {
  inset: 0;
  transform: scaleY(0);
  transform-origin: center top;
}
.pencil-action-arrow.is-active.is-right b {
  animation: pencil-action-arrow-right 620ms cubic-bezier(0.32, 0, 0.18, 1) var(--action-arrow-delay) forwards;
}
.pencil-action-arrow.is-active.is-down b {
  animation: pencil-action-arrow-down 620ms cubic-bezier(0.32, 0, 0.18, 1) var(--action-arrow-delay) forwards;
}
@keyframes pencil-action-arrow-right { to { transform: scaleX(1); } }
@keyframes pencil-action-arrow-down { to { transform: scaleY(1); } }
@media (max-width: 560px) {
  .pencil-action-arrow.is-right {
    grid-template-rows: auto 28px;
  }
  .pencil-action-arrow.is-right i {
    width: 2px;
    min-width: 0;
    height: 28px;
  }
  .pencil-action-arrow.is-right i::after {
    top: auto;
    right: auto;
    bottom: 1px;
    left: -3px;
    transform: rotate(135deg);
  }
  .pencil-action-arrow.is-right b {
    inset: 0;
    transform: scaleY(0);
    transform-origin: center top;
  }
  .pencil-action-arrow.is-active.is-right b {
    animation-name: pencil-action-arrow-down;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pencil-action-arrow b { animation: none !important; transform: none !important; }
}
</style>
