import { computed, ref } from "vue";
import { learningUnits, legacyLessonAliases, recommendedLearningUnits } from "../course-data.mjs";

const STORAGE_KEY = "llmtrain-learning-v3";
const LEGACY_STORAGE_KEY = "llmtrain-learning-v2";
const OLDEST_STORAGE_KEY = "llmtrain-progress-v1";
export const PROGRESS_EVENT = "llmtrain-progress-updated";

export type ReadingStatus = "in-progress" | "completed" | "skipped";
export type MasteryState = "unassessed" | "practicing" | "needs-review" | "mastered";
export type ExerciseResult = "unassessed" | "correct" | "partial" | "incorrect";
export type ConceptState = "unassessed" | "fragile" | "rebuilding" | "stable";
export type ExerciseKind = "primary" | "transfer";

export type ConceptRef = {
  id: string;
  label: string;
  prerequisites?: string[];
};

export type MisconceptionRef = {
  id: string;
  label: string;
  explanation: string;
  options?: string[];
};

export type RemediationRef = {
  href: string;
  title: string;
  reason: string;
};

export type ExerciseEvidence = {
  attemptedAt: string;
  result: Exclude<ExerciseResult, "unassessed">;
  misconceptionIds: string[];
  kind: ExerciseKind;
};

export type ReadingPosition = {
  anchor?: string;
  heading?: string;
  scrollY: number;
};

export type UnitProgress = {
  status: ReadingStatus;
  firstVisitedAt: string;
  lastVisitedAt: string;
  completedAt?: string;
  skippedAt?: string;
  position?: ReadingPosition;
  reflection?: string;
  reflectionUpdatedAt?: string;
  exerciseIds: string[];
};

export type ExerciseProgress = {
  id: string;
  lessonSource: string;
  question: string;
  type: string;
  href: string;
  anchor: string;
  kind: ExerciseKind;
  parentId?: string;
  concepts: ConceptRef[];
  misconceptions: MisconceptionRef[];
  remediation?: RemediationRef;
  requiresTransfer: boolean;
  attempts: number;
  firstResult: ExerciseResult;
  lastResult: ExerciseResult;
  lastAttemptAt?: string;
  nextReviewAt?: string;
  intervalDays: number;
  misconceptionIds: string[];
  evidence: ExerciseEvidence[];
  lastTransferResult?: Exclude<ExerciseResult, "unassessed">;
  remediatedAt?: string;
  draft?: string;
  response?: string;
  selected?: number[];
};

type StoredLearningState = {
  version: 3;
  units: Record<string, UnitProgress>;
  exercises: Record<string, ExerciseProgress>;
  lastSession: { source: string; updatedAt: string } | null;
};

export type ExerciseMeta = Pick<
  ExerciseProgress,
  | "id"
  | "lessonSource"
  | "question"
  | "type"
  | "href"
  | "anchor"
  | "kind"
  | "concepts"
  | "misconceptions"
  | "requiresTransfer"
> & Pick<ExerciseProgress, "parentId" | "remediation"> & {
  legacyIds?: string[];
};

export type ConceptMisconceptionSummary = {
  id: string;
  label: string;
  count: number;
  lastSeenAt: string;
};

export type ConceptProgressSummary = {
  id: string;
  label: string;
  state: ConceptState;
  prerequisites: string[];
  prerequisiteLabels: string[];
  unknownPrerequisiteCount: number;
  influenceCount: number;
  lessonSource: string;
  exerciseId: string;
  href: string;
  anchor: string;
  lastEvidence?: ExerciseEvidence;
  activeMisconceptions: ConceptMisconceptionSummary[];
};

const emptyState = (): StoredLearningState => ({
  version: 3,
  units: {},
  exercises: {},
  lastSession: null
});

const state = ref<StoredLearningState>(emptyState());
const revision = ref(0);
let initialized = false;

const validSources = new Set(learningUnits.map((unit) => unit.source));
const unitBySource = new Map(learningUnits.map((unit) => [unit.source, unit]));
const sourceAliases = new Map(legacyLessonAliases.map((alias) => [alias.oldSource, alias.source]));

function migrateSource(value: unknown) {
  const source = String(value ?? "").trim();
  return sourceAliases.get(source) ?? source;
}

function migrateHref(value: unknown) {
  const href = String(value ?? "").trim();
  for (const alias of legacyLessonAliases) {
    for (const oldHref of [alias.oldHref, `${alias.oldHref}.md`]) {
      if (href === oldHref || href.startsWith(`${oldHref}#`) || href.startsWith(`${oldHref}?`)) {
        return `${alias.href}${href.slice(oldHref.length)}`;
      }
    }
  }
  return href;
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function uniqueStrings(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item)))]
    : [];
}

function mergeExerciseRecords(records: ExerciseProgress[]) {
  if (!records.length) return undefined;
  const timestamp = (record: ExerciseProgress) => Date.parse(record.lastAttemptAt ?? "") || 0;
  const latest = [...records].sort((left, right) =>
    timestamp(right) - timestamp(left) || right.attempts - left.attempts
  )[0];
  const evidence = [...new Map(records
    .flatMap((record) => record.evidence)
    .map((item) => [
      `${item.attemptedAt}|${item.result}|${item.kind}|${item.misconceptionIds.join(",")}`,
      item
    ] as const)).values()]
    .sort((left, right) => Date.parse(left.attemptedAt) - Date.parse(right.attemptedAt));
  const attempted = [...records]
    .filter((record) => record.attempts > 0)
    .sort((left, right) => timestamp(left) - timestamp(right));
  const reportedAttempts = records.reduce((sum, record) => sum + record.attempts, 0);
  const untrackedAttempts = records.reduce(
    (sum, record) => sum + Math.max(0, record.attempts - record.evidence.length),
    0
  );

  return {
    ...latest,
    attempts: evidence.length
      ? Math.max(evidence.length + untrackedAttempts, ...records.map((record) => record.attempts))
      : reportedAttempts,
    firstResult: evidence[0]?.result ?? attempted[0]?.firstResult ?? latest.firstResult,
    evidence
  };
}

function sanitizeConcepts(value: unknown): ConceptRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<ConceptRef>;
    const id = String(record.id ?? "").trim();
    const label = String(record.label ?? "").trim();
    if (!id || !label) return [];
    const prerequisites = uniqueStrings(record.prerequisites);
    return [{ id, label, prerequisites: prerequisites.length ? prerequisites : undefined }];
  });
}

function sanitizeMisconceptions(value: unknown): MisconceptionRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<MisconceptionRef>;
    const id = String(record.id ?? "").trim();
    const label = String(record.label ?? "").trim();
    const explanation = String(record.explanation ?? "").trim();
    if (!id || !label || !explanation) return [];
    const options = uniqueStrings(record.options).map((option) => option.toUpperCase());
    return [{ id, label, explanation, options: options.length ? options : undefined }];
  });
}

function sanitizeRemediation(value: unknown): RemediationRef | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<RemediationRef>;
  const href = migrateHref(record.href);
  const title = String(record.title ?? "").trim();
  const reason = String(record.reason ?? "").trim();
  return href && title && reason ? { href, title, reason } : undefined;
}

function sanitizeEvidence(value: unknown): ExerciseEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<ExerciseEvidence>;
    if (!record.attemptedAt || !["correct", "partial", "incorrect"].includes(record.result ?? "")) {
      return [];
    }
    return [{
      attemptedAt: record.attemptedAt,
      result: record.result as Exclude<ExerciseResult, "unassessed">,
      misconceptionIds: uniqueStrings(record.misconceptionIds),
      kind: record.kind === "transfer" ? "transfer" : "primary"
    }];
  }).slice(-40);
}

function notify() {
  revision.value += 1;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value));
  } catch {
    // The course remains usable when storage is unavailable or full.
  }
  notify();
}

function sanitizeState(parsed: Partial<StoredLearningState>): StoredLearningState {
  const units: Record<string, UnitProgress> = {};
  for (const [storedSource, record] of Object.entries(parsed.units ?? {})) {
    const source = migrateSource(storedSource);
    if (!validSources.has(source) || !record) continue;
    const status = ["in-progress", "completed", "skipped"].includes(record.status)
      ? record.status
      : "in-progress";
    const reflection = typeof record.reflection === "string"
      ? record.reflection.trim().slice(0, 240)
      : "";
    const normalized: UnitProgress = {
      status: status as ReadingStatus,
      firstVisitedAt: record.firstVisitedAt || record.lastVisitedAt || nowIso(),
      lastVisitedAt: record.lastVisitedAt || nowIso(),
      completedAt: record.completedAt,
      skippedAt: record.skippedAt,
      position: record.position && Number.isFinite(record.position.scrollY)
        ? {
            anchor: record.position.anchor,
            heading: record.position.heading,
            scrollY: Math.max(0, record.position.scrollY)
          }
        : undefined,
      reflection: reflection || undefined,
      reflectionUpdatedAt: reflection ? record.reflectionUpdatedAt : undefined,
      exerciseIds: Array.isArray(record.exerciseIds)
        ? [...new Set(record.exerciseIds.filter((id) => typeof id === "string"))]
        : []
    };
    const existing = units[source];
    if (!existing) {
      units[source] = normalized;
      continue;
    }
    const latest = Date.parse(normalized.lastVisitedAt) >= Date.parse(existing.lastVisitedAt)
      ? normalized
      : existing;
    const oldestFirstVisit = Date.parse(normalized.firstVisitedAt) < Date.parse(existing.firstVisitedAt)
      ? normalized.firstVisitedAt
      : existing.firstVisitedAt;
    units[source] = {
      ...latest,
      firstVisitedAt: oldestFirstVisit,
      exerciseIds: [...new Set([...existing.exerciseIds, ...normalized.exerciseIds])]
    };
  }

  const exercises: Record<string, ExerciseProgress> = {};
  for (const [id, record] of Object.entries(parsed.exercises ?? {})) {
    if (!record) continue;
    const lessonSource = migrateSource(record.lessonSource);
    if (!validSources.has(lessonSource)) continue;
    const result = ["unassessed", "correct", "partial", "incorrect"].includes(record.lastResult)
      ? record.lastResult
      : "unassessed";
    exercises[id] = {
      id,
      lessonSource,
      question: String(record.question ?? ""),
      type: String(record.type ?? "qa"),
      href: migrateHref(record.href) || unitBySource.get(lessonSource)?.href || "",
      anchor: String(record.anchor ?? ""),
      kind: record.kind === "transfer" ? "transfer" : "primary",
      parentId: record.parentId,
      concepts: sanitizeConcepts(record.concepts),
      misconceptions: sanitizeMisconceptions(record.misconceptions),
      remediation: sanitizeRemediation(record.remediation),
      requiresTransfer: Boolean(record.requiresTransfer),
      attempts: Math.max(0, Number(record.attempts) || 0),
      firstResult: ["correct", "partial", "incorrect"].includes(record.firstResult)
        ? record.firstResult
        : "unassessed",
      lastResult: result as ExerciseResult,
      lastAttemptAt: record.lastAttemptAt,
      nextReviewAt: record.nextReviewAt,
      intervalDays: Math.max(0, Number(record.intervalDays) || 0),
      misconceptionIds: uniqueStrings(record.misconceptionIds),
      evidence: sanitizeEvidence(record.evidence),
      lastTransferResult: ["correct", "partial", "incorrect"].includes(record.lastTransferResult ?? "")
        ? record.lastTransferResult
        : undefined,
      remediatedAt: record.remediatedAt,
      draft: record.draft,
      response: record.response,
      selected: Array.isArray(record.selected)
        ? record.selected.filter((value) => Number.isInteger(value))
        : undefined
    };
  }

  const lastSource = migrateSource(parsed.lastSession?.source);
  return {
    version: 3,
    units,
    exercises,
    lastSession: lastSource && validSources.has(lastSource)
      ? { source: lastSource, updatedAt: parsed.lastSession?.updatedAt || nowIso() }
      : null
  };
}

function applyStoredValue(raw: string | null) {
  if (!raw) {
    state.value = emptyState();
    notify();
    return;
  }
  try {
    state.value = sanitizeState(JSON.parse(raw) as Partial<StoredLearningState>);
  } catch {
    state.value = emptyState();
  }
  notify();
}

function migrateLegacyProgress() {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return false;
  try {
    state.value = sanitizeState(JSON.parse(raw) as Partial<StoredLearningState>);
    persist();
    return true;
  } catch {
    return false;
  }
}

function migrateOldestProgress() {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(OLDEST_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { completed?: string[]; lastVisited?: string | null };
    const timestamp = nowIso();
    const units: Record<string, UnitProgress> = {};
    for (const storedSource of parsed.completed ?? []) {
      const source = migrateSource(storedSource);
      if (!validSources.has(source)) continue;
      units[source] = {
        status: "completed",
        firstVisitedAt: timestamp,
        lastVisitedAt: timestamp,
        completedAt: timestamp,
        exerciseIds: []
      };
    }
    const lastVisited = migrateSource(parsed.lastVisited);
    if (lastVisited && validSources.has(lastVisited) && !units[lastVisited]) {
      units[lastVisited] = {
        status: "in-progress",
        firstVisitedAt: timestamp,
        lastVisitedAt: timestamp,
        exerciseIds: []
      };
    }
    state.value = {
      version: 3,
      units,
      exercises: {},
      lastSession: lastVisited && validSources.has(lastVisited)
        ? { source: lastVisited, updatedAt: timestamp }
        : null
    };
    persist();
    return true;
  } catch {
    return false;
  }
}

export function initializeProgress() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (current) applyStoredValue(current);
  else if (!migrateLegacyProgress() && !migrateOldestProgress()) applyStoredValue(null);

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) applyStoredValue(event.newValue);
  });
}

function updateUnit(source: string, updater: (record: UnitProgress | undefined) => UnitProgress) {
  if (!validSources.has(source)) return;
  state.value = {
    ...state.value,
    units: { ...state.value.units, [source]: updater(state.value.units[source]) }
  };
  persist();
}

function baseUnitRecord(existing?: UnitProgress): UnitProgress {
  const timestamp = nowIso();
  return existing ?? {
    status: "in-progress",
    firstVisitedAt: timestamp,
    lastVisitedAt: timestamp,
    exerciseIds: []
  };
}

function isReviewDue(record: ExerciseProgress, now = Date.now()) {
  return Boolean(record.nextReviewAt && Date.parse(record.nextReviewAt) <= now);
}

function needsExerciseReview(record: ExerciseProgress, now = Date.now()) {
  if (record.kind === "transfer" || record.attempts === 0) return false;
  if (isReviewDue(record, now)) return true;
  if (record.requiresTransfer) {
    if (record.lastTransferResult === "incorrect" || record.lastTransferResult === "partial") return true;
    if (record.remediatedAt) return false;
  }
  return record.lastResult === "partial" || record.lastResult === "incorrect";
}

function conceptSummariesFromState(): ConceptProgressSummary[] {
  const records = Object.values(state.value.exercises);
  const conceptLabels = new Map<string, string>();
  const prerequisitesByConcept = new Map<string, Set<string>>();
  for (const record of records) {
    for (const concept of record.concepts) {
      conceptLabels.set(concept.id, concept.label);
      const prerequisites = prerequisitesByConcept.get(concept.id) ?? new Set<string>();
      for (const prerequisite of concept.prerequisites ?? []) prerequisites.add(prerequisite);
      prerequisitesByConcept.set(concept.id, prerequisites);
    }
  }

  const influence = new Map<string, number>();
  for (const prerequisites of prerequisitesByConcept.values()) {
    for (const prerequisite of prerequisites) {
      influence.set(prerequisite, (influence.get(prerequisite) ?? 0) + 1);
    }
  }

  return [...conceptLabels.entries()].map(([id, label]) => {
    const conceptRecords = records.filter((record) => record.concepts.some((concept) => concept.id === id));
    const primaryRecords = conceptRecords.filter((record) => record.kind === "primary" && record.attempts > 0);
    const evidence = conceptRecords
      .flatMap((record) => record.evidence)
      .sort((left, right) => Date.parse(left.attemptedAt) - Date.parse(right.attemptedAt));
    const now = Date.now();
    const fragile = primaryRecords.some((record) => {
      if (isReviewDue(record, now)) return true;
      if (record.requiresTransfer) {
        if (record.lastTransferResult === "incorrect" || record.lastTransferResult === "partial") return true;
        if (record.remediatedAt) return false;
      }
      return record.lastResult === "partial" || record.lastResult === "incorrect";
    });
    const rebuilding = !fragile && primaryRecords.some((record) =>
      record.requiresTransfer && !record.remediatedAt
    );
    const conceptState: ConceptState = !primaryRecords.length
      ? "unassessed"
      : fragile
        ? "fragile"
        : rebuilding
          ? "rebuilding"
          : "stable";

    const definitions = new Map(
      conceptRecords.flatMap((record) => record.misconceptions.map((item) => [item.id, item] as const))
    );
    const latestRecoveryAt = primaryRecords.reduce((latest, record) => {
      const recoveredAt = record.requiresTransfer
        ? record.remediatedAt
        : record.lastResult === "correct"
          ? record.lastAttemptAt
          : undefined;
      return recoveredAt && Date.parse(recoveredAt) > Date.parse(latest || "") ? recoveredAt : latest;
    }, "");
    const misconceptionStats = new Map<string, ConceptMisconceptionSummary>();
    for (const item of evidence.filter((entry) =>
      !latestRecoveryAt || Date.parse(entry.attemptedAt) > Date.parse(latestRecoveryAt)
    )) {
      for (const misconceptionId of item.misconceptionIds) {
        const definition = definitions.get(misconceptionId);
        if (!definition) continue;
        const previous = misconceptionStats.get(misconceptionId);
        misconceptionStats.set(misconceptionId, {
          id: misconceptionId,
          label: definition.label,
          count: (previous?.count ?? 0) + 1,
          lastSeenAt: item.attemptedAt
        });
      }
    }
    const activeMisconceptions = conceptState === "stable"
      ? []
      : [...misconceptionStats.values()].sort((left, right) =>
          right.count - left.count || Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt)
        );
    const latestRecord = [...conceptRecords]
      .filter((record) => record.kind === "primary")
      .sort((left, right) => Date.parse(right.lastAttemptAt ?? "") - Date.parse(left.lastAttemptAt ?? ""))[0]
      ?? conceptRecords[0];
    const prerequisites = [...(prerequisitesByConcept.get(id) ?? [])];
    const prerequisiteLabels = prerequisites.flatMap((item) => {
      const dependencyLabel = conceptLabels.get(item);
      return dependencyLabel ? [dependencyLabel] : [];
    });

    return {
      id,
      label,
      state: conceptState,
      prerequisites,
      prerequisiteLabels,
      unknownPrerequisiteCount: prerequisites.length - prerequisiteLabels.length,
      influenceCount: influence.get(id) ?? 0,
      lessonSource: latestRecord?.lessonSource ?? "",
      exerciseId: latestRecord?.id ?? "",
      href: latestRecord?.href ?? "",
      anchor: latestRecord?.anchor ?? "",
      lastEvidence: evidence.at(-1),
      activeMisconceptions
    };
  }).sort((left, right) => {
    const priority: Record<ConceptState, number> = { fragile: 0, rebuilding: 1, stable: 2, unassessed: 3 };
    return priority[left.state] - priority[right.state] || right.influenceCount - left.influenceCount;
  });
}

export function useCourseProgress() {
  const completedCount = computed(() =>
    Object.values(state.value.units).filter((record) => record.status === "completed").length
  );
  const percent = computed(() => {
    const completed = recommendedLearningUnits.filter(
      (unit) => state.value.units[unit.source]?.status === "completed"
    ).length;
    return Math.round((completed / recommendedLearningUnits.length) * 100);
  });
  const lastVisitedSource = computed(() => state.value.lastSession?.source ?? null);
  const lastSessionUnit = computed(() =>
    learningUnits.find((unit) => unit.source === state.value.lastSession?.source) ?? null
  );
  const conceptSummaries = computed(conceptSummariesFromState);
  const dueReviewExercises = computed(() => {
    const now = Date.now();
    return Object.values(state.value.exercises)
      .filter((record) => record.kind === "primary" && record.attempts > 0 && isReviewDue(record, now))
      .sort((left, right) => Date.parse(left.nextReviewAt ?? "") - Date.parse(right.nextReviewAt ?? ""));
  });
  const needsReviewExercises = computed(() => {
    const now = Date.now();
    return Object.values(state.value.exercises)
      .filter((record) => needsExerciseReview(record, now))
      .sort((left, right) => Date.parse(right.lastAttemptAt ?? "") - Date.parse(left.lastAttemptAt ?? ""));
  });

  function getUnitProgress(source: string) {
    revision.value;
    return state.value.units[source];
  }

  function getReadingStatus(source: string): ReadingStatus | "unstarted" {
    return getUnitProgress(source)?.status ?? "unstarted";
  }

  function markVisited(source: string) {
    if (!validSources.has(source)) return;
    const timestamp = nowIso();
    const existing = state.value.units[source];
    const record = baseUnitRecord(existing);
    state.value = {
      ...state.value,
      units: {
        ...state.value.units,
        [source]: { ...record, lastVisitedAt: timestamp }
      },
      lastSession: { source, updatedAt: timestamp }
    };
    persist();
  }

  function saveReadingPosition(source: string, position?: ReadingPosition) {
    if (!validSources.has(source) || !position || !Number.isFinite(position.scrollY)) return;
    const timestamp = nowIso();
    const record = baseUnitRecord(state.value.units[source]);
    const normalizedPosition = {
      ...position,
      scrollY: Math.max(0, Math.round(position.scrollY))
    };
    if (
      record.position &&
      record.position.anchor === normalizedPosition.anchor &&
      record.position.heading === normalizedPosition.heading &&
      Math.abs(record.position.scrollY - normalizedPosition.scrollY) < 8
    ) return;
    state.value = {
      ...state.value,
      units: {
        ...state.value.units,
        [source]: {
          ...record,
          lastVisitedAt: timestamp,
          position: normalizedPosition
        }
      },
      lastSession: { source, updatedAt: timestamp }
    };
    persist();
  }

  function markCompleted(source: string) {
    updateUnit(source, (existing) => ({
      ...baseUnitRecord(existing),
      status: "completed",
      completedAt: nowIso(),
      skippedAt: undefined
    }));
  }

  function setInProgress(source: string) {
    updateUnit(source, (existing) => ({
      ...baseUnitRecord(existing),
      status: "in-progress",
      completedAt: undefined,
      skippedAt: undefined,
      lastVisitedAt: nowIso()
    }));
  }

  function toggleCompleted(source: string) {
    if (getReadingStatus(source) === "completed") setInProgress(source);
    else markCompleted(source);
  }

  function markSkipped(source: string) {
    updateUnit(source, (existing) => ({
      ...baseUnitRecord(existing),
      status: "skipped",
      skippedAt: nowIso(),
      completedAt: undefined
    }));
  }

  function saveUnitReflection(source: string, reflection: string) {
    const normalized = reflection.trim().slice(0, 240);
    updateUnit(source, (existing) => ({
      ...baseUnitRecord(existing),
      reflection: normalized || undefined,
      reflectionUpdatedAt: normalized ? nowIso() : undefined
    }));
  }

  function registerExercise(meta: ExerciseMeta) {
    if (!validSources.has(meta.lessonSource)) return;
    const { legacyIds = [], ...storedMeta } = meta;
    const normalizedLegacyIds = uniqueStrings(legacyIds).filter((id) => id !== meta.id);
    const legacyRecords = normalizedLegacyIds
      .map((id) => state.value.exercises[id])
      .filter((record): record is ExerciseProgress => Boolean(record));
    const existingExercise = mergeExerciseRecords([
      ...(state.value.exercises[meta.id] ? [state.value.exercises[meta.id]] : []),
      ...legacyRecords
    ]);
    const unit = baseUnitRecord(state.value.units[meta.lessonSource]);
    const alreadyRegistered = unit.exerciseIds.includes(meta.id);
    const metadataChanged = existingExercise && (
      existingExercise.lessonSource !== storedMeta.lessonSource ||
      existingExercise.question !== storedMeta.question ||
      existingExercise.type !== storedMeta.type ||
      existingExercise.href !== storedMeta.href ||
      existingExercise.anchor !== storedMeta.anchor ||
      existingExercise.kind !== storedMeta.kind ||
      existingExercise.parentId !== storedMeta.parentId ||
      existingExercise.requiresTransfer !== storedMeta.requiresTransfer ||
      JSON.stringify(existingExercise.concepts) !== JSON.stringify(storedMeta.concepts) ||
      JSON.stringify(existingExercise.misconceptions) !== JSON.stringify(storedMeta.misconceptions) ||
      JSON.stringify(existingExercise.remediation) !== JSON.stringify(storedMeta.remediation)
    );
    if (existingExercise && alreadyRegistered && !metadataChanged && !legacyRecords.length) return;
    const exercises = { ...state.value.exercises };
    for (const id of normalizedLegacyIds) delete exercises[id];
    state.value = {
      ...state.value,
      units: {
        ...state.value.units,
        [meta.lessonSource]: {
          ...unit,
          exerciseIds: [...new Set([
            ...unit.exerciseIds.filter((id) => !normalizedLegacyIds.includes(id)),
            meta.id
          ])]
        }
      },
      exercises: {
        ...exercises,
        [meta.id]: existingExercise
          ? { ...existingExercise, ...storedMeta }
          : {
              ...storedMeta,
              attempts: 0,
              firstResult: "unassessed",
              lastResult: "unassessed",
              intervalDays: 0,
              misconceptionIds: [],
              evidence: []
            }
      }
    };
    persist();
  }

  function saveExerciseDraft(id: string, draft: string) {
    const existing = state.value.exercises[id];
    if (!existing || existing.draft === draft) return;
    state.value = {
      ...state.value,
      exercises: { ...state.value.exercises, [id]: { ...existing, draft } }
    };
    persist();
  }

  function recordExerciseResult(
    id: string,
    result: Exclude<ExerciseResult, "unassessed">,
    details: { response?: string; selected?: number[]; misconceptionIds?: string[] } = {}
  ) {
    const existing = state.value.exercises[id];
    if (!existing) return;
    let intervalDays = 1;
    if (result === "partial") intervalDays = 3;
    if (result === "correct") {
      if (existing.attempts > 0 && existing.lastResult !== "correct") intervalDays = 3;
      else if (existing.intervalDays >= 7) intervalDays = Math.min(30, existing.intervalDays * 2);
      else intervalDays = 7;
    }
    const timestamp = nowIso();
    const misconceptionIds = result === "correct" ? [] : uniqueStrings(details.misconceptionIds);
    const evidence: ExerciseEvidence = {
      attemptedAt: timestamp,
      result,
      misconceptionIds,
      kind: existing.kind
    };
    const updated: ExerciseProgress = {
      ...existing,
      attempts: existing.attempts + 1,
      firstResult: existing.attempts === 0 ? result : existing.firstResult,
      lastResult: result,
      lastAttemptAt: timestamp,
      nextReviewAt: existing.kind === "transfer" ? undefined : addDays(intervalDays),
      intervalDays: existing.kind === "transfer" ? 0 : intervalDays,
      misconceptionIds,
      evidence: [...existing.evidence, evidence].slice(-40),
      response: details.response ?? existing.response,
      selected: details.selected ?? existing.selected,
      draft: details.response ?? existing.draft,
      lastTransferResult: existing.kind === "primary" ? undefined : existing.lastTransferResult,
      remediatedAt: existing.kind === "primary" ? undefined : existing.remediatedAt
    };
    const exercises = { ...state.value.exercises, [id]: updated };

    if (existing.kind === "transfer" && existing.parentId) {
      const parent = exercises[existing.parentId];
      if (parent) {
        const recoveredAfterMistake = parent.lastResult !== "correct" || parent.firstResult !== "correct";
        const parentInterval = result === "correct"
          ? recoveredAfterMistake
            ? 3
            : Math.max(7, parent.intervalDays)
          : 1;
        exercises[existing.parentId] = {
          ...parent,
          lastTransferResult: result,
          remediatedAt: result === "correct" ? timestamp : undefined,
          nextReviewAt: addDays(parentInterval),
          intervalDays: parentInterval
        };
      }
    }
    state.value = {
      ...state.value,
      exercises
    };
    persist();
  }

  function getExercise(id: string) {
    revision.value;
    return state.value.exercises[id];
  }

  function getMasteryState(source: string): MasteryState {
    const unit = getUnitProgress(source);
    const exercises = (unit?.exerciseIds ?? [])
      .map((id) => state.value.exercises[id])
      .filter((record): record is ExerciseProgress => Boolean(record) && record.kind === "primary");
    if (!exercises.length) return "unassessed";
    if (unit?.status === "completed" && exercises.some((record) => record.attempts === 0)) {
      return "needs-review";
    }
    if (exercises.every((record) => record.attempts === 0)) return "unassessed";
    if (exercises.some((record) => needsExerciseReview(record))) return "needs-review";
    if (exercises.every((record) =>
      record.attempts > 0 && (
        record.requiresTransfer
          ? Boolean(record.remediatedAt)
          : record.lastResult === "correct"
      )
    )) {
      return "mastered";
    }
    return "practicing";
  }

  function getDisplayState(source: string) {
    const reading = getReadingStatus(source);
    if (reading === "skipped") return "skipped";
    const mastery = getMasteryState(source);
    if (mastery === "needs-review") return "needs-review";
    if (mastery === "mastered") return "mastered";
    if (reading === "completed") return "completed";
    if (reading === "in-progress" || mastery === "practicing") return "in-progress";
    return "unstarted";
  }

  function getLessonReviewCount(source: string) {
    return needsReviewExercises.value.filter((record) => record.lessonSource === source).length;
  }

  function nextRecommendedUnit() {
    const dueRecord = dueReviewExercises.value[0];
    if (dueRecord) return unitBySource.get(dueRecord.lessonSource);

    const repeatedMisconception = conceptSummaries.value.find((concept) =>
      concept.activeMisconceptions.some((item) => item.count >= 2)
    );
    if (repeatedMisconception) return unitBySource.get(repeatedMisconception.lessonSource);

    const fragilePrerequisite = conceptSummaries.value
      .filter((concept) => concept.state === "fragile")
      .sort((left, right) => right.influenceCount - left.influenceCount)[0];
    if (fragilePrerequisite) return unitBySource.get(fragilePrerequisite.lessonSource);

    const rebuildingConcept = conceptSummaries.value.find((concept) => concept.state === "rebuilding");
    if (rebuildingConcept) return unitBySource.get(rebuildingConcept.lessonSource);

    const nextRequired = recommendedLearningUnits.find((unit) => {
      const status = getReadingStatus(unit.source);
      return status !== "completed" && status !== "skipped";
    });
    if (nextRequired) return nextRequired;
    return learningUnits.find((unit) => {
      const status = getReadingStatus(unit.source);
      return status !== "completed" && status !== "skipped";
    }) ?? lastSessionUnit.value ?? recommendedLearningUnits[0];
  }

  function resetProgress() {
    state.value = emptyState();
    persist();
  }

  return {
    revision,
    completedCount,
    percent,
    lastVisitedSource,
    lastSessionUnit,
    conceptSummaries,
    dueReviewExercises,
    needsReviewExercises,
    getUnitProgress,
    getReadingStatus,
    getMasteryState,
    getDisplayState,
    getLessonReviewCount,
    getExercise,
    markVisited,
    saveReadingPosition,
    markCompleted,
    setInProgress,
    toggleCompleted,
    markSkipped,
    saveUnitReflection,
    registerExercise,
    saveExerciseDraft,
    recordExerciseResult,
    nextRecommendedUnit,
    resetProgress
  };
}
