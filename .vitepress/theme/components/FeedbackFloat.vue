<script setup lang="ts">
import { nextTick, ref } from "vue";

const ISSUE_URL = "https://github.com/chengzhang0528/LLMTrain/issues/new";
const feedbackTypes = ["内容勘误", "讲解建议", "使用问题", "功能建议", "其他"] as const;

const dialog = ref<HTMLDialogElement | null>(null);
const feedbackInput = ref<HTMLTextAreaElement | null>(null);
const feedbackType = ref<(typeof feedbackTypes)[number]>(feedbackTypes[0]);
const feedback = ref("");
let returnFocusTo: HTMLElement | null = null;

function openFeedback() {
  if (!dialog.value) return;
  returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value.showModal();
  void nextTick(() => feedbackInput.value?.focus());
}

function closeFeedback() {
  dialog.value?.close();
}

function restoreFocus() {
  returnFocusTo?.focus();
  returnFocusTo = null;
}

function closeFromBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) closeFeedback();
}

function clearValidation() {
  feedbackInput.value?.setCustomValidity("");
}

function submitFeedback() {
  const summary = feedback.value.replace(/\s+/g, " ").trim();
  if (!summary) {
    feedbackInput.value?.setCustomValidity("请填写一句话反馈");
    feedbackInput.value?.reportValidity();
    return;
  }

  const pageTitle = document.title.replace(/ · LLMTrain$/, "") || "LLMTrain";
  const pageUrl = window.location.href;
  const issueUrl = new URL(ISSUE_URL);
  const issueTitle = `[${feedbackType.value}] ${summary}`;
  const issueBody = [
    "## 反馈类型",
    feedbackType.value,
    "",
    "## 一句话反馈",
    summary,
    "",
    "## 来源页面",
    `- 页面：${pageTitle}`,
    `- 链接：${pageUrl}`,
    "",
    "> 此内容由 LLMTrain 站内反馈入口生成。"
  ].join("\n");

  issueUrl.searchParams.set("title", issueTitle);
  issueUrl.searchParams.set("body", issueBody);
  window.location.assign(issueUrl.toString());
}
</script>

<template>
  <button
    class="feedback-float"
    type="button"
    aria-haspopup="dialog"
    aria-controls="course-feedback-dialog"
    title="反馈意见"
    @click="openFeedback"
  >
    <span aria-hidden="true">反馈</span>
    <span class="visually-hidden">反馈意见</span>
  </button>

  <dialog
    id="course-feedback-dialog"
    ref="dialog"
    class="feedback-dialog"
    aria-labelledby="feedback-dialog-title"
    @click="closeFromBackdrop"
    @close="restoreFocus"
    @keydown.esc.prevent="closeFeedback"
  >
    <form class="feedback-form" @submit.prevent="submitFeedback">
      <header class="feedback-heading">
        <h2 id="feedback-dialog-title">向课程提反馈</h2>
        <button class="feedback-close" type="button" aria-label="关闭反馈" title="关闭" @click="closeFeedback">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <label class="feedback-field">
        <span>反馈类型</span>
        <select v-model="feedbackType" name="feedback-type">
          <option v-for="item in feedbackTypes" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>

      <label class="feedback-field">
        <span>一句话反馈</span>
        <textarea
          ref="feedbackInput"
          v-model="feedback"
          name="feedback"
          rows="4"
          required
          placeholder="例如：D03 的术语预览在手机上挡住了公式"
          @input="clearValidation"
        />
      </label>

      <footer class="feedback-actions">
        <button class="feedback-cancel" type="button" @click="closeFeedback">取消</button>
        <button class="feedback-submit" type="submit">前往 GitHub 提交</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.feedback-float {
  position: fixed;
  z-index: 40;
  top: calc(58% - 68px);
  right: max(14px, env(safe-area-inset-right));
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 50%;
  padding: 0;
  color: #fff;
  background: #2873a6;
  box-shadow: 0 8px 22px rgba(27, 72, 104, 0.24);
  font: inherit;
  font-size: 13px;
  font-weight: 760;
  line-height: 1;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.feedback-float:hover,
.feedback-float:focus-visible {
  background: #1d5d8a;
  box-shadow: 0 10px 26px rgba(27, 72, 104, 0.32);
  transform: translateY(-2px);
}

.feedback-float::after {
  position: absolute;
  right: calc(100% + 10px);
  padding: 5px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  box-shadow: 0 6px 16px rgba(20, 31, 28, 0.14);
  content: "反馈意见";
  font-size: 12px;
  font-weight: 650;
  opacity: 0;
  pointer-events: none;
  transform: translateX(4px);
  transition: opacity 140ms ease, transform 140ms ease;
  white-space: nowrap;
}

.feedback-float:hover::after,
.feedback-float:focus-visible::after {
  opacity: 1;
  transform: translateX(0);
}

.feedback-dialog {
  width: min(92vw, 520px);
  max-width: none;
  max-height: min(86vh, 620px);
  margin: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  box-shadow: 0 24px 64px rgba(17, 25, 23, 0.28);
}

.feedback-dialog::backdrop {
  background: rgba(18, 25, 23, 0.56);
}

.feedback-form {
  display: grid;
  padding: 22px;
  gap: 18px;
}

.feedback-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.feedback-heading h2 {
  margin: 0;
  border: 0;
  padding: 0;
  font-size: 20px;
  line-height: 1.35;
}

.feedback-close {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  padding: 0;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg);
  font: inherit;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.feedback-close:hover,
.feedback-close:focus-visible {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.feedback-field {
  display: grid;
  gap: 7px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 680;
}

.feedback-field select,
.feedback-field textarea {
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  font: inherit;
  font-size: 15px;
}

.feedback-field select {
  min-height: 44px;
  padding: 0 12px;
}

.feedback-field textarea {
  min-height: 116px;
  padding: 11px 12px;
  line-height: 1.6;
  resize: vertical;
}

.feedback-field select:focus-visible,
.feedback-field textarea:focus-visible {
  border-color: var(--vp-c-brand-1);
  outline: 2px solid var(--vp-c-brand-soft);
  outline-offset: 1px;
}

.feedback-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.feedback-cancel,
.feedback-submit {
  min-height: 42px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 0 16px;
  font: inherit;
  font-size: 14px;
  font-weight: 680;
  cursor: pointer;
}

.feedback-cancel {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}

.feedback-submit {
  border-color: var(--vp-button-brand-border);
  color: var(--vp-button-brand-text);
  background: var(--vp-button-brand-bg);
}

.feedback-cancel:hover,
.feedback-cancel:focus-visible {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.feedback-submit:hover,
.feedback-submit:focus-visible {
  border-color: var(--vp-button-brand-hover-border);
  color: var(--vp-button-brand-hover-text);
  background: var(--vp-button-brand-hover-bg);
}

@media (max-width: 760px) {
  .feedback-float {
    top: auto;
    right: env(safe-area-inset-right);
    bottom: calc(126px + env(safe-area-inset-bottom));
    width: 42px;
    height: 42px;
    border-right: 0;
    border-radius: 6px 0 0 6px;
    font-size: 12px;
  }

  .feedback-float::after {
    display: none;
  }

  .feedback-float:hover,
  .feedback-float:focus-visible {
    transform: none;
  }

  .feedback-dialog {
    width: calc(100% - 24px);
    max-height: calc(100dvh - 24px);
  }

  .feedback-form {
    padding: 18px 16px;
    gap: 16px;
  }

  .feedback-actions {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1fr);
  }

  .feedback-cancel {
    justify-self: end;
  }

  .feedback-submit {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feedback-float,
  .feedback-float::after {
    transition: none;
  }
}
</style>
