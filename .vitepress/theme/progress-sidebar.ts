import { learningUnits } from "../course-data.mjs";
import { PROGRESS_EVENT, useCourseProgress } from "./progress";

let installed = false;

function normalizePath(value: string) {
  try {
    return decodeURI(new URL(value, window.location.href).pathname).replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

export function installProgressSidebar() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  const progress = useCourseProgress();
  let scheduled = false;

  const unitPaths = learningUnits.map((unit) => ({
    unit,
    path: normalizePath(unit.href)
  }));

  function decorate() {
    scheduled = false;
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(".VPSidebar a[href]")) {
      const path = normalizePath(anchor.href);
      const match = unitPaths.find((item) => path.endsWith(item.path));
      const existing = anchor.querySelector<HTMLElement>(".sidebar-progress-badge");
      if (!match) {
        existing?.remove();
        continue;
      }
      const reading = progress.getReadingStatus(match.unit.source);
      const mastery = progress.getMasteryState(match.unit.source);
      if (reading === "unstarted" && mastery === "unassessed") {
        existing?.remove();
        continue;
      }
      let state = progress.getDisplayState(match.unit.source);
      let label = {
        "in-progress": "学习中",
        completed: "已读完",
        skipped: "已跳过",
        "needs-review": "待复习",
        mastered: "已掌握",
        unstarted: "未开始"
      }[state];
      if (reading === "completed" && mastery === "needs-review") label = "已读·复习";
      if (reading === "completed" && mastery === "mastered") label = "已读·掌握";
      if (reading === "in-progress" && mastery === "needs-review") label = "学习·复习";
      const badge = existing ?? document.createElement("span");
      badge.className = `sidebar-progress-badge state-${state}`;
      if (badge.textContent !== label) badge.textContent = label;
      const readingText = {
        unstarted: "未开始",
        "in-progress": "学习中",
        completed: "已读完",
        skipped: "已跳过"
      }[reading];
      const masteryText = {
        unassessed: "未检测",
        practicing: "练习中",
        "needs-review": "待复习",
        mastered: "已掌握"
      }[mastery];
      const description = `阅读：${readingText}；练习：${masteryText}`;
      badge.title = description;
      badge.setAttribute("aria-label", description);
      if (!existing) anchor.append(badge);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  const start = () => {
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener(PROGRESS_EVENT, schedule);
    window.addEventListener("storage", schedule);
    schedule();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
