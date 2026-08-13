const readyAttribute = "data-formula-speech-ready";
const speechEvent = "llmtrain:speech-start";

let activeButton: HTMLButtonElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  activeUtterance = null;
  if (activeButton) {
    activeButton.classList.remove("is-speaking");
    activeButton.setAttribute("aria-pressed", "false");
    activeButton.setAttribute("aria-label", activeButton.dataset.idleLabel ?? "朗读公式");
    activeButton.title = activeButton.dataset.idleLabel ?? "朗读公式";
    activeButton.textContent = "▶";
  }
  activeButton = null;
}

function speakFormula(button: HTMLButtonElement, reading: string) {
  if (activeButton === button) {
    stopSpeech();
    return;
  }
  stopSpeech();
  activeButton = button;
  button.classList.add("is-speaking");
  button.setAttribute("aria-pressed", "true");
  button.setAttribute("aria-label", `停止朗读公式：${reading}`);
  button.title = `停止朗读公式：${reading}`;
  button.textContent = "■";
  window.dispatchEvent(new CustomEvent(speechEvent, { detail: { source: "formula" } }));

  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    stopSpeech();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(reading);
  utterance.lang = "zh-CN";
  utterance.rate = 0.82;
  utterance.onend = utterance.onerror = () => {
    if (activeUtterance === utterance) stopSpeech();
  };
  activeUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function decorateFormula(container: HTMLElement) {
  if (container.dataset.formulaSpeechReady === "true") return;
  const reading = container.dataset.formulaReading?.trim();
  if (!reading) return;
  const isDisplay = container.getAttribute("display") === "true";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `formula-speech-button${isDisplay ? " formula-speech-button--display" : " formula-speech-button--inline"}`;
  button.textContent = "▶";
  button.title = `朗读公式：${reading}`;
  button.setAttribute("aria-label", `朗读公式：${reading}`);
  button.setAttribute("aria-pressed", "false");
  button.dataset.idleLabel = `朗读公式：${reading}`;
  button.addEventListener("click", () => speakFormula(button, reading));
  container.dataset.formulaSpeechReady = "true";

  if (isDisplay) {
    const wrapper = document.createElement("div");
    wrapper.className = "formula-speech-display";
    container.replaceWith(wrapper);
    wrapper.append(container, button);
  } else {
    container.insertAdjacentElement("afterend", button);
  }
}

function scanFormulas() {
  if (activeButton && !activeButton.isConnected) stopSpeech();
  document
    .querySelectorAll<HTMLElement>(".vp-doc mjx-container.MathJax[data-formula-reading]")
    .forEach(decorateFormula);
}

export function installFormulaSpeech() {
  if (typeof document === "undefined" || document.documentElement.hasAttribute(readyAttribute)) return;
  document.documentElement.setAttribute(readyAttribute, "true");
  window.addEventListener(speechEvent, (event) => {
    if ((event as CustomEvent<{ source?: string }>).detail?.source !== "formula") stopSpeech();
  });
  window.addEventListener("pagehide", stopSpeech);
  const observer = new MutationObserver(() => requestAnimationFrame(scanFormulas));
  observer.observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(scanFormulas);
}
