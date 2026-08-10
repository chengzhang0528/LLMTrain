<script setup lang="ts">
import { nextTick, ref } from "vue";

const feedbackTypes = ["内容勘误", "讲解建议", "使用问题", "功能建议", "其他"] as const;
const feedbackEndpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT?.trim() ?? "";

type SubmissionState = "idle" | "submitting" | "success" | "error";

const dialog = ref<HTMLDialogElement | null>(null);
const feedbackInput = ref<HTMLTextAreaElement | null>(null);
const feedbackType = ref<(typeof feedbackTypes)[number]>(feedbackTypes[0]);
const feedback = ref("");
const website = ref("");
const submissionState = ref<SubmissionState>("idle");
const submissionMessage = ref("");
const submittedIssueNumber = ref<number | null>(null);
const submittedIssueUrl = ref("");
let returnFocusTo: HTMLElement | null = null;

function openFeedback() {
  if (!dialog.value) return;
  if (submissionState.value === "success") resetSubmission();
  returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value.showModal();
  void nextTick(() => feedbackInput.value?.focus());
}

function closeFeedback() {
  if (submissionState.value === "submitting") return;
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
  if (submissionState.value === "error") resetSubmission();
}

function resetSubmission() {
  submissionState.value = "idle";
  submissionMessage.value = "";
  submittedIssueNumber.value = null;
  submittedIssueUrl.value = "";
}

async function submitFeedback() {
  const summary = feedback.value.replace(/\s+/g, " ").trim();
  if (!summary) {
    feedbackInput.value?.setCustomValidity("请填写一句话反馈");
    feedbackInput.value?.reportValidity();
    return;
  }

  if (!feedbackEndpoint) {
    submissionState.value = "error";
    submissionMessage.value = "反馈服务暂时不可用，请稍后再试";
    return;
  }

  const pageTitle = document.title.replace(/ · LLMTrain$/, "") || "LLMTrain";
  const pageUrl = window.location.href;
  submissionState.value = "submitting";
  submissionMessage.value = "";

  try {
    const response = await fetch(feedbackEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: feedbackType.value,
        message: summary,
        pageTitle,
        pageUrl,
        website: website.value
      })
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      issueNumber?: number;
      issueUrl?: string;
    };

    if (!response.ok || !result.issueNumber || !result.issueUrl) {
      throw new Error(result.error || "反馈服务暂时不可用，请稍后再试");
    }

    submittedIssueNumber.value = result.issueNumber;
    submittedIssueUrl.value = result.issueUrl;
    feedback.value = "";
    submissionState.value = "success";
  } catch (error) {
    submissionState.value = "error";
    submissionMessage.value = error instanceof Error ? error.message : "反馈服务暂时不可用，请稍后再试";
  }
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
        <button
          class="feedback-close"
          type="button"
          aria-label="关闭反馈"
          title="关闭"
          :disabled="submissionState === 'submitting'"
          @click="closeFeedback"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <section v-if="submissionState === 'success'" class="feedback-success" role="status">
        <strong>反馈已提交</strong>
        <p>已创建 Issue #{{ submittedIssueNumber }}。</p>
        <div class="feedback-success-actions">
          <a :href="submittedIssueUrl" target="_blank" rel="noopener noreferrer">查看 Issue</a>
          <button type="button" @click="closeFeedback">完成</button>
        </div>
      </section>

      <template v-else>
        <label class="feedback-field">
          <span>反馈类型</span>
          <select v-model="feedbackType" name="feedback-type" :disabled="submissionState === 'submitting'">
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
            :disabled="submissionState === 'submitting'"
            placeholder="例如：D03 的术语预览在手机上挡住了公式"
            @input="clearValidation"
          />
        </label>

        <label class="feedback-honeypot" aria-hidden="true">
          <span>网站</span>
          <input v-model="website" name="website" tabindex="-1" autocomplete="off" />
        </label>

        <p v-if="submissionState === 'error'" class="feedback-error" role="alert">{{ submissionMessage }}</p>

        <footer class="feedback-actions">
          <button
            class="feedback-cancel"
            type="button"
            :disabled="submissionState === 'submitting'"
            @click="closeFeedback"
          >
            取消
          </button>
          <button class="feedback-submit" type="submit" :disabled="submissionState === 'submitting'">
            {{ submissionState === "submitting" ? "提交中..." : "提交反馈" }}
          </button>
        </footer>
      </template>
    </form>
  </dialog>
</template>

<style scoped>
.feedback-float {
  position: fixed;
  z-index: 40;
  top: calc(58% - 68px);
  right: env(safe-area-inset-right);
  display: grid;
  width: 32px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 6px 0 0 6px;
  padding: 0;
  color: var(--vp-c-text-1);
  background: rgba(40, 115, 166, 0.52);
  box-shadow: 0 6px 18px rgba(27, 72, 104, 0.12);
  opacity: 0.72;
  font: inherit;
  font-size: 11px;
  font-weight: 760;
  line-height: 1;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, opacity 160ms ease;
}

.feedback-float:hover,
.feedback-float:focus-visible {
  color: #fff;
  background: #1d5d8a;
  box-shadow: 0 10px 26px rgba(27, 72, 104, 0.32);
  opacity: 1;
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

.feedback-close:disabled,
.feedback-cancel:disabled,
.feedback-submit:disabled {
  cursor: wait;
  opacity: 0.62;
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

.feedback-honeypot {
  position: fixed;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.feedback-error {
  margin: 0;
  border-left: 3px solid var(--vp-c-danger-1);
  padding: 9px 11px;
  color: var(--vp-c-danger-1);
  background: color-mix(in srgb, var(--vp-c-danger-soft, rgba(178, 58, 72, 0.1)) 72%, transparent);
  font-size: 13px;
  line-height: 1.55;
}

.feedback-success {
  display: grid;
  min-height: 200px;
  align-content: center;
  gap: 8px;
  text-align: center;
}

.feedback-success > strong {
  color: var(--vp-c-brand-1);
  font-size: 20px;
}

.feedback-success > p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.feedback-success-actions {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  gap: 10px;
}

.feedback-success-actions > a,
.feedback-success-actions > button {
  display: inline-grid;
  min-height: 42px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 0 16px;
  place-items: center;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  font: inherit;
  font-size: 14px;
  font-weight: 680;
  text-decoration: none;
  cursor: pointer;
}

.feedback-success-actions > a:hover,
.feedback-success-actions > a:focus-visible,
.feedback-success-actions > button:hover,
.feedback-success-actions > button:focus-visible {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
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
