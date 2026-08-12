import { wikiTerms } from "../wiki-terms.mjs";

const previewId = "wiki-preview-tooltip";
const readyAttribute = "data-wiki-preview-ready";
const glossaryTerms = new Map(wikiTerms.map((term) => [term.anchor, term]));

let activeSpeechButton: HTMLButtonElement | null = null;
let activeAudio: HTMLAudioElement | null = null;

function resetSpeechButton(button: HTMLButtonElement | null) {
  if (!button) return;
  button.classList.remove("is-speaking");
  button.setAttribute("aria-pressed", "false");
}

function stopActiveSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  resetSpeechButton(activeSpeechButton);
  activeSpeechButton = null;
}

function finishSpeech(button: HTMLButtonElement) {
  resetSpeechButton(button);
  if (activeSpeechButton === button) activeSpeechButton = null;
  activeAudio = null;
}

function speakEnglish(text: string, audioPath: string, button: HTMLButtonElement) {
  stopActiveSpeech();
  activeSpeechButton = button;
  button.classList.add("is-speaking");
  button.setAttribute("aria-pressed", "true");

  if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.78;
    utterance.onend = utterance.onerror = () => finishSpeech(button);
    window.speechSynthesis.speak(utterance);
    return;
  }

  const resolvedPath = `${import.meta.env.BASE_URL}${audioPath.replace(/^\//, "")}`;
  const audio = new Audio(resolvedPath);
  activeAudio = audio;
  audio.onended = audio.onerror = () => finishSpeech(button);
  audio.play().catch(() => finishSpeech(button));
}

function createSpeechButton(term: string, speech: string, audioPath: string) {
  const button = document.createElement("button");
  button.className = "wiki-speech-button";
  button.type = "button";
  button.textContent = "\u25b6";
  button.title = `朗读 ${term}`;
  button.setAttribute("aria-label", `朗读英文术语 ${term}`);
  button.setAttribute("aria-pressed", "false");
  if (!(speech || audioPath)) {
    button.disabled = true;
    button.title = "该术语暂无发音";
  } else {
    button.addEventListener("click", () => speakEnglish(speech, audioPath, button));
  }
  return button;
}

function decorateGlossaryPronunciations() {
  for (const anchor of document.querySelectorAll<HTMLElement>('[id^="term-"]')) {
    if (anchor.dataset.pronunciationReady === "true") continue;
    const term = glossaryTerms.get(anchor.id);
    const termCell = anchor.closest("td");
    const definitionCell = termCell?.nextElementSibling;
    const title = termCell?.querySelector("strong");
    if (!term || !termCell || !(definitionCell instanceof HTMLTableCellElement) || !title) continue;

    const pronunciation = document.createElement("span");
    pronunciation.className = "glossary-pronunciation";
    const ipa = document.createElement("span");
    ipa.className = "glossary-pronunciation-ipa";
    ipa.textContent = term.pronunciation;
    pronunciation.append(ipa, createSpeechButton(term.term, term.speech, term.audio));
    title.insertAdjacentElement("afterend", pronunciation);

    const usage = document.createElement("p");
    usage.className = "glossary-usage";
    const usageLabel = document.createElement("strong");
    usageLabel.textContent = "沟通时这样说";
    const usageExample = document.createElement("span");
    usageExample.textContent = term.usage.replace(/^沟通示例：/, "");
    usage.append(usageLabel, usageExample);
    definitionCell.append(usage);
    anchor.dataset.pronunciationReady = "true";
  }
}

function getWikiLink(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element
    ? target.closest<HTMLAnchorElement>("a.wiki-term")
    : null;
}

export function installWikiPreview() {
  if (typeof document === "undefined" || document.documentElement.hasAttribute(readyAttribute)) {
    return;
  }

  document.documentElement.setAttribute(readyAttribute, "true");

  const tooltip = document.createElement("aside");
  tooltip.id = previewId;
  tooltip.className = "wiki-preview";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-label", "术语预览");
  tooltip.hidden = true;

  const label = document.createElement("p");
  label.className = "wiki-preview-label";
  label.textContent = "术语预览";
  const heading = document.createElement("div");
  heading.className = "wiki-preview-heading";
  const title = document.createElement("strong");
  const pronunciation = document.createElement("span");
  pronunciation.className = "wiki-preview-pronunciation";
  const previewSpeechButton = createSpeechButton("英文术语", "", "");
  heading.append(title, pronunciation, previewSpeechButton);
  const summary = document.createElement("p");
  const visual = document.createElement("div");
  visual.className = "wiki-preview-visual";
  visual.hidden = true;
  const usage = document.createElement("p");
  usage.className = "wiki-preview-usage";
  const usageLabel = document.createElement("span");
  usageLabel.textContent = "沟通时这样说";
  const usageExample = document.createElement("span");
  usageExample.className = "wiki-preview-usage-example";
  usage.append(usageLabel, usageExample);
  const warning = document.createElement("p");
  warning.className = "wiki-preview-warning";
  const warningLabel = document.createElement("span");
  warningLabel.textContent = "不要误解为";
  const misconception = document.createElement("span");
  misconception.className = "wiki-preview-misconception";
  warning.append(warningLabel, misconception);
  const actions = document.createElement("div");
  actions.className = "wiki-preview-actions";
  actions.hidden = true;
  const detailLink = document.createElement("a");
  detailLink.className = "wiki-preview-detail";
  detailLink.textContent = "查看完整术语";
  const closeButton = document.createElement("button");
  closeButton.className = "wiki-preview-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭术语预览");
  closeButton.title = "关闭术语预览";
  closeButton.textContent = "×";
  actions.append(detailLink, closeButton);
  tooltip.append(label, heading, summary, visual, usage, warning, actions);
  document.body.append(tooltip);

  let activeTarget: HTMLAnchorElement | null = null;
  let suppressFocusPreview = false;
  let pendingTapTarget: HTMLAnchorElement | null = null;
  let pendingTapHref: string | null = null;
  let pendingTapTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingHideTimer: ReturnType<typeof setTimeout> | undefined;
  const compactViewport = window.matchMedia("(max-width: 768px)");
  const pointerBridgeDelay = 240;

  function appendVisualCaption(container: HTMLElement, caption: unknown) {
    if (!String(caption ?? "").trim()) return;
    const text = document.createElement("p");
    text.className = "wiki-preview-visual-caption";
    text.textContent = String(caption);
    container.append(text);
  }

  function renderPipeline(spec: Record<string, unknown>) {
    const track = document.createElement("div");
    track.className = "wiki-preview-pipeline";
    const items = Array.isArray(spec.items) ? spec.items.slice(0, 4) : [];
    items.forEach((item, index) => {
      const node = document.createElement("span");
      node.className = "wiki-preview-pipeline-node";
      node.style.setProperty("--wiki-step", String(index));
      node.textContent = String(item);
      track.append(node);
      if (index < items.length - 1) {
        const arrow = document.createElement("span");
        arrow.className = "wiki-preview-pipeline-arrow";
        arrow.textContent = "→";
        track.append(arrow);
      }
    });
    visual.append(track);
  }

  function renderVector(spec: Record<string, unknown>) {
    const values = Array.isArray(spec.values) ? spec.values.slice(0, 8) : [];
    const focus = Number(spec.focus);
    const grid = document.createElement("div");
    grid.className = "wiki-preview-vector";
    const rows = [
      { label: "数学", values: values.map((_, index) => index + 1) },
      { label: "a", values },
      { label: "Python", values: values.map((_, index) => index) }
    ];
    rows.forEach((row, rowIndex) => {
      const rowElement = document.createElement("div");
      rowElement.className = "wiki-preview-vector-row";
      const rowLabel = document.createElement("span");
      rowLabel.textContent = row.label;
      const cells = document.createElement("div");
      cells.style.gridTemplateColumns = `repeat(${values.length}, minmax(0, 1fr))`;
      row.values.forEach((value, index) => {
        const cell = document.createElement(rowIndex === 1 ? "strong" : "span");
        cell.textContent = String(value);
        if (index + 1 === focus) cell.className = "focus";
        cells.append(cell);
      });
      rowElement.append(rowLabel, cells);
      grid.append(rowElement);
    });
    const mapping = document.createElement("p");
    mapping.className = "wiki-preview-vector-mapping";
    mapping.textContent = `${String(spec.mathLabel ?? "")} ↔ ${String(spec.codeLabel ?? "")}`;
    grid.append(mapping);
    visual.append(grid);
  }

  function renderBars(spec: Record<string, unknown>) {
    const bars = document.createElement("div");
    bars.className = "wiki-preview-bars";
    const items = Array.isArray(spec.items) ? spec.items.slice(0, 4) : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const row = document.createElement("div");
      const name = document.createElement("span");
      name.textContent = String(record.label ?? "候选");
      const meter = document.createElement("i");
      const fill = document.createElement("b");
      const value = Math.max(0, Math.min(100, Number(record.value) || 0));
      fill.style.setProperty("--wiki-bar", `${value}%`);
      meter.append(fill);
      const number = document.createElement("strong");
      number.textContent = `${value}%`;
      row.append(name, meter, number);
      bars.append(row);
    }
    visual.append(bars);
  }

  function renderVisual(encoded: string | undefined) {
    visual.replaceChildren();
    visual.hidden = true;
    visual.classList.remove("is-running");
    if (!encoded) return;
    try {
      const spec = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
      if (spec.type === "pipeline") renderPipeline(spec);
      else if (spec.type === "vector") renderVector(spec);
      else if (spec.type === "bars") renderBars(spec);
      else return;
      appendVisualCaption(visual, spec.caption);
      visual.setAttribute("role", "img");
      visual.setAttribute("aria-label", String(spec.caption ?? "术语视觉说明"));
      visual.hidden = false;
      requestAnimationFrame(() => visual.classList.add("is-running"));
    } catch {
      visual.hidden = true;
    }
  }

  function restoreTapPreviewHref() {
    if (pendingTapTarget && pendingTapHref !== null) {
      pendingTapTarget.setAttribute("href", pendingTapHref);
    }
    pendingTapTarget = null;
    pendingTapHref = null;
    if (pendingTapTimer) clearTimeout(pendingTapTimer);
    pendingTapTimer = undefined;
  }

  function usesTapPreview(event: MouseEvent | PointerEvent) {
    return compactViewport.matches || (event instanceof PointerEvent && event.pointerType === "touch");
  }

  function clearTargetState(target: HTMLAnchorElement) {
    if (target.getAttribute("aria-describedby") === previewId) {
      target.removeAttribute("aria-describedby");
    }
    target.removeAttribute("aria-controls");
    target.removeAttribute("aria-expanded");
    target.removeAttribute("aria-haspopup");
    target.classList.remove("is-preview-active");
  }

  function cancelPendingHide() {
    if (!pendingHideTimer) return;
    clearTimeout(pendingHideTimer);
    pendingHideTimer = undefined;
  }

  function hide(target?: HTMLAnchorElement | null) {
    if (target && activeTarget !== target) return;
    cancelPendingHide();
    if (activeTarget) clearTargetState(activeTarget);
    activeTarget = null;
    tooltip.hidden = true;
    tooltip.classList.remove("is-interactive");
    tooltip.setAttribute("role", "tooltip");
    actions.hidden = true;
    if (activeSpeechButton === previewSpeechButton) {
      stopActiveSpeech();
    }
  }

  function scheduleHide(target?: HTMLAnchorElement | null) {
    cancelPendingHide();
    pendingHideTimer = setTimeout(() => {
      pendingHideTimer = undefined;
      if (target && activeTarget !== target) return;
      if (
        activeTarget?.matches(":hover") ||
        tooltip.matches(":hover") ||
        tooltip.contains(document.activeElement)
      ) return;
      hide(target);
    }, pointerBridgeDelay);
  }

  function positionPreview() {
    const target = activeTarget;
    if (!target || tooltip.hidden) return;

    requestAnimationFrame(() => {
      if (activeTarget !== target || tooltip.hidden) return;
      const anchorRect = target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const edge = 12;
      const idealLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      tooltip.style.left = `${Math.max(edge, Math.min(idealLeft, window.innerWidth - tooltipRect.width - edge))}px`;
      const below = anchorRect.bottom + 10;
      const above = anchorRect.top - tooltipRect.height - 10;
      tooltip.style.top = `${below + tooltipRect.height <= window.innerHeight - edge ? below : Math.max(edge, above)}px`;
    });
  }

  function show(target: HTMLAnchorElement, interactive = false) {
    cancelPendingHide();
    if (activeTarget && activeTarget !== target) clearTargetState(activeTarget);
    activeTarget = target;
    const term = target.dataset.wikiTitle ?? target.textContent?.trim() ?? "术语";
    const speech = target.dataset.wikiSpeech ?? term;
    const audioPath = target.dataset.wikiAudio ?? "";
    title.textContent = term;
    pronunciation.textContent = target.dataset.wikiPronunciation ?? "";
    previewSpeechButton.title = `朗读 ${term}`;
    previewSpeechButton.setAttribute("aria-label", `朗读英文术语 ${term}`);
    previewSpeechButton.disabled = !(speech || audioPath);
    previewSpeechButton.onclick = () => speakEnglish(speech, audioPath, previewSpeechButton);
    summary.textContent = target.dataset.wikiSummary ?? "";
    renderVisual(target.dataset.wikiVisual);
    usageExample.textContent = (target.dataset.wikiUsage ?? "").replace(/^沟通示例：/, "");
    misconception.textContent = target.dataset.wikiMisconception ?? "";
    detailLink.href = target.href;
    target.setAttribute("aria-describedby", previewId);
    target.classList.add("is-preview-active");
    tooltip.classList.toggle("is-interactive", interactive);
    tooltip.setAttribute("role", interactive ? "dialog" : "tooltip");
    actions.hidden = !interactive;
    if (interactive) {
      target.setAttribute("aria-controls", previewId);
      target.setAttribute("aria-expanded", "true");
      target.setAttribute("aria-haspopup", "dialog");
    } else {
      target.removeAttribute("aria-controls");
      target.removeAttribute("aria-expanded");
      target.removeAttribute("aria-haspopup");
    }
    tooltip.hidden = false;
    positionPreview();
  }

  function onPointerOver(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    const target = getWikiLink(event.target);
    if (target) show(target, true);
  }

  function onPointerOut(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    const target = getWikiLink(event.target);
    if (
      !target ||
      (event.relatedTarget instanceof Node &&
        (target.contains(event.relatedTarget) ||
          (tooltip.classList.contains("is-interactive") && tooltip.contains(event.relatedTarget))))
    ) return;
    scheduleHide(target);
  }

  function onFocusIn(event: FocusEvent) {
    const target = getWikiLink(event.target);
    if (!target) return;
    if (suppressFocusPreview) {
      suppressFocusPreview = false;
      return;
    }
    show(target, true);
  }

  function onFocusOut(event: FocusEvent) {
    const target = getWikiLink(event.target);
    if (
      !target ||
      (event.relatedTarget instanceof Node &&
        (target.contains(event.relatedTarget) ||
          (tooltip.classList.contains("is-interactive") && tooltip.contains(event.relatedTarget))))
    ) return;
    hide(target);
  }

  function restoreTargetFocus(target: HTMLAnchorElement | null) {
    if (!target) return;
    suppressFocusPreview = true;
    target.focus({ preventScroll: true });
    queueMicrotask(() => {
      suppressFocusPreview = false;
    });
  }

  function onPointerDown(event: PointerEvent) {
    const target = getWikiLink(event.target);
    const isPrimaryPointer = event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (!target || !isPrimaryPointer || !usesTapPreview(event)) return;

    restoreTapPreviewHref();
    pendingTapTarget = target;
    pendingTapHref = target.getAttribute("href");
    target.removeAttribute("href");
    pendingTapTimer = setTimeout(restoreTapPreviewHref, 5000);
  }

  function onClick(event: MouseEvent) {
    const target = getWikiLink(event.target);
    const isPrimaryClick = event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const isPendingTap = target !== null && target === pendingTapTarget;

    if (target && isPrimaryClick && (isPendingTap || usesTapPreview(event))) {
      restoreTapPreviewHref();
      event.preventDefault();
      event.stopPropagation();
      if (activeTarget === target && tooltip.classList.contains("is-interactive") && !tooltip.hidden) {
        hide(target);
      } else {
        show(target, true);
      }
      return;
    }

    if (
      !tooltip.hidden &&
      tooltip.classList.contains("is-interactive") &&
      event.target instanceof Node &&
      !tooltip.contains(event.target)
    ) {
      hide();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || tooltip.hidden) return;
    const target = activeTarget;
    hide();
    restoreTargetFocus(target);
  }

  function onViewportChange() {
    if (
      activeTarget &&
      document.activeElement === activeTarget
    ) {
      positionPreview();
      return;
    }
    hide();
  }

  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointercancel", restoreTapPreviewHref, true);
  window.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);

  closeButton.addEventListener("click", () => {
    const target = activeTarget;
    hide();
    restoreTargetFocus(target);
  });

  tooltip.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch" || tooltip.contains(document.activeElement)) return;
    scheduleHide();
  });
  tooltip.addEventListener("pointerenter", cancelPendingHide);

  let glossaryUpdateScheduled = false;
  const glossaryObserver = new MutationObserver(() => {
    if (glossaryUpdateScheduled) return;
    glossaryUpdateScheduled = true;
    requestAnimationFrame(() => {
      glossaryUpdateScheduled = false;
      decorateGlossaryPronunciations();
    });
  });
  glossaryObserver.observe(document.body, { childList: true, subtree: true });
  decorateGlossaryPronunciations();
}
