const previewId = "wiki-preview-tooltip";
const readyAttribute = "data-wiki-preview-ready";

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
  tooltip.hidden = true;

  const label = document.createElement("p");
  label.className = "wiki-preview-label";
  label.textContent = "术语预览";
  const title = document.createElement("strong");
  const summary = document.createElement("p");
  const warning = document.createElement("p");
  warning.className = "wiki-preview-warning";
  const warningLabel = document.createElement("span");
  warningLabel.textContent = "不要误解为";
  const misconception = document.createElement("span");
  misconception.className = "wiki-preview-misconception";
  warning.append(warningLabel, misconception);
  tooltip.append(label, title, summary, warning);
  document.body.append(tooltip);

  let activeTarget: HTMLAnchorElement | null = null;

  function hide(target?: HTMLAnchorElement | null) {
    const current = target ?? activeTarget;
    if (current?.getAttribute("aria-describedby") === previewId) {
      current.removeAttribute("aria-describedby");
    }
    if (!target || activeTarget === target) {
      activeTarget = null;
      tooltip.hidden = true;
    }
  }

  function show(target: HTMLAnchorElement) {
    activeTarget = target;
    title.textContent = target.dataset.wikiTitle ?? target.textContent?.trim() ?? "术语";
    summary.textContent = target.dataset.wikiSummary ?? "";
    misconception.textContent = target.dataset.wikiMisconception ?? "";
    target.setAttribute("aria-describedby", previewId);
    tooltip.hidden = false;

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

  function onPointerOver(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    const target = getWikiLink(event.target);
    if (target) show(target);
  }

  function onPointerOut(event: PointerEvent) {
    const target = getWikiLink(event.target);
    if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
    hide(target);
  }

  function onFocusIn(event: FocusEvent) {
    const target = getWikiLink(event.target);
    if (target) show(target);
  }

  function onFocusOut(event: FocusEvent) {
    const target = getWikiLink(event.target);
    if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
    hide(target);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") hide();
  }

  function onViewportChange() {
    hide();
  }

  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("pointerout", onPointerOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
}
