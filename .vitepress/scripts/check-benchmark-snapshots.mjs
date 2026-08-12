import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "course/06-拓展知识库/模型评测与选型/README.md",
  "course/06-拓展知识库/模型评测与选型/01-先定义模型选择合同.md",
  "course/06-拓展知识库/模型评测与选型/02-把评分指标翻成大白话.md"
];

const maxAgeDays = Number(process.env.BENCHMARK_MAX_AGE_DAYS ?? 45);
const todayText = process.env.BENCHMARK_TODAY ?? new Date().toISOString().slice(0, 10);
const today = Date.parse(`${todayText}T00:00:00Z`);
const failures = [];

if (!Number.isFinite(today)) {
  console.error(`无法解析 BENCHMARK_TODAY：${todayText}`);
  process.exit(1);
}

const evidencePath = path.join(root, "internal/来源与质量审计/榜单快照/模型评测-2026-08-12.json");
let evidence;
try {
  evidence = JSON.parse(await readFile(evidencePath, "utf8"));
} catch (error) {
  console.error(`无法读取榜单证据记录：${evidencePath}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (!Array.isArray(evidence.sources)) {
  console.error("榜单证据记录缺少 sources 数组");
  process.exit(1);
}

const evidenceById = new Map();
for (const source of evidence.sources) {
  if (!source || typeof source.id !== "string" || !source.id) {
    failures.push("证据记录存在缺少 id 的条目");
    continue;
  }
  if (evidenceById.has(source.id)) {
    failures.push(`证据 id 重复：${source.id}`);
    continue;
  }
  const hasSourceArtifact = typeof source.sourceArtifact === "string" && source.sourceArtifact.length > 0;
  const hasSourceArtifactSha256 = typeof source.sourceArtifactSha256 === "string" && source.sourceArtifactSha256.length > 0;
  if ("contentSha256" in source) {
    failures.push(`${source.id}: 不得用规范化记录的 contentSha256 冒充官方源工件哈希`);
  }
  if (hasSourceArtifact !== hasSourceArtifactSha256) {
    failures.push(`${source.id}: sourceArtifact 与 sourceArtifactSha256 必须同时存在`);
  }
  if (!hasSourceArtifact && source.verificationMethod !== "manual transcription from official source; no immutable source artifact saved") {
    failures.push(`${source.id}: 未保存不可变源工件时必须明确记录人工转录边界`);
  }
  evidenceById.set(source.id, source);
}

const referencedEvidenceIds = new Set();

function sameNumber(left, right) {
  return typeof left === "number" && typeof right === "number" && Object.is(left, right);
}

function sameValue(left, right) {
  return left === right;
}

function expectedScoreRank(rows, index) {
  const score = rows[index]?.score;
  if (typeof score !== "number") return null;
  return 1 + rows.filter((row) => typeof row.score === "number" && row.score > score).length;
}

function expectedRankStatus(rows, index) {
  const rank = expectedScoreRank(rows, index);
  if (rank === null) return null;
  const score = rows[index].score;
  const tied = rows.filter((row) => row.score === score).length > 1;
  return `${tied ? "并列" : ""}第 ${rank}`;
}

function parseBenchmarkBlocks(source, relativePath) {
  const blocks = [];
  const fencePattern = /```(benchmark-(?:chart|leaderboard))\s*\r?\n([\s\S]*?)\r?\n```/g;
  let match;
  while ((match = fencePattern.exec(source))) {
    try {
      blocks.push({ type: match[1], data: JSON.parse(match[2]) });
    } catch (error) {
      failures.push(`${relativePath}: ${match[1]} JSON 无法解析：${error instanceof Error ? error.message : error}`);
    }
  }
  return blocks;
}

function validateEvidenceLink(block, relativePath) {
  const { type, data } = block;
  if (!data || typeof data !== "object") {
    failures.push(`${relativePath}: ${type} 必须是 JSON 对象`);
    return null;
  }
  if (typeof data.evidenceId !== "string" || !data.evidenceId) {
    failures.push(`${relativePath}: ${type} 缺少唯一 evidenceId`);
    return null;
  }
  if (referencedEvidenceIds.has(data.evidenceId)) {
    failures.push(`${relativePath}: evidenceId 重复引用：${data.evidenceId}`);
  }
  referencedEvidenceIds.add(data.evidenceId);
  const record = evidenceById.get(data.evidenceId);
  if (!record) {
    failures.push(`${relativePath}: evidenceId 不在证据记录中：${data.evidenceId}`);
    return null;
  }
  if (record.courseFile !== relativePath) {
    failures.push(`${relativePath}: ${data.evidenceId} 的 courseFile 不一致（记录为 ${record.courseFile}）`);
  }
  if (data.sourceUrl !== record.sourceUrl) {
    failures.push(`${relativePath}: ${data.evidenceId} 的 sourceUrl 不一致`);
  }
  if (!Array.isArray(record.rows)) {
    failures.push(`${relativePath}: ${data.evidenceId} 的证据记录缺少 rows`);
    return null;
  }
  return record;
}

function validateLeaderboard(data, record, relativePath) {
  if (!Array.isArray(data.rows)) {
    failures.push(`${relativePath}: ${data.evidenceId} leaderboard 缺少 rows`);
    return;
  }
  if (data.rows.length !== record.rows.length) {
    failures.push(`${relativePath}: ${data.evidenceId} 行数与证据记录不一致`);
    return;
  }
  for (let index = 0; index < data.rows.length; index += 1) {
    const pageRow = data.rows[index];
    const evidenceRow = record.rows[index];
    if (pageRow?.name !== evidenceRow?.model) {
      failures.push(`${relativePath}: ${data.evidenceId} 第 ${index + 1} 行模型名不一致`);
      continue;
    }
    if (pageRow.org !== evidenceRow.organization) {
      failures.push(`${relativePath}: ${data.evidenceId} ${pageRow.name} 的机构与证据记录不一致`);
    }
    if (Boolean(pageRow.open) !== evidenceRow.openWeights) {
      failures.push(`${relativePath}: ${data.evidenceId} ${pageRow.name} 的开放权重状态与证据记录不一致`);
    }
    const pageValues = pageRow.values ?? {};
    const pageKeys = Object.keys(pageValues).sort();
    const evidenceKeys = Object.keys(evidenceRow)
      .filter((key) => !["model", "organization", "openWeights"].includes(key))
      .sort();
    if (JSON.stringify(pageKeys) !== JSON.stringify(evidenceKeys)) {
      failures.push(`${relativePath}: ${data.evidenceId} ${pageRow.name} 的指标列不完整或含多余列`);
    }
    for (const [key, value] of Object.entries(pageValues)) {
      if (!(key in evidenceRow)) {
        failures.push(`${relativePath}: ${data.evidenceId} ${pageRow.name} 的指标 ${key} 不在证据记录中`);
      } else if (!sameNumber(value, evidenceRow[key])) {
        failures.push(`${relativePath}: ${data.evidenceId} ${pageRow.name} 的 ${key} 与证据记录不一致`);
      }
    }
  }
}

function validateChart(data, record, relativePath) {
  if (!Array.isArray(data.bars)) {
    failures.push(`${relativePath}: ${data.evidenceId} chart 缺少 bars`);
    return;
  }
  if (data.bars.length !== record.rows.length) {
    failures.push(`${relativePath}: ${data.evidenceId} 柱数与证据记录不一致`);
    return;
  }
  if (record.positionLabel && data.positionLabel !== record.positionLabel) {
    failures.push(`${relativePath}: ${data.evidenceId} 的位置列标题与证据记录不一致`);
  }
  for (let index = 0; index < data.bars.length; index += 1) {
    const bar = data.bars[index];
    const evidenceRow = record.rows[index];
    if (bar?.label !== evidenceRow?.model) {
      failures.push(`${relativePath}: ${data.evidenceId} 第 ${index + 1} 根柱模型名不一致`);
      continue;
    }
    const evidenceValue = evidenceRow.score ?? evidenceRow.meanTask;
    if (!sameNumber(bar.value, evidenceValue)) {
      failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的 value 与证据记录不一致`);
    }
    for (const key of ["display", "note", "status"]) {
      if (!sameValue(bar[key], evidenceRow[key])) {
        failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的 ${key} 与证据记录不一致`);
      }
    }
    if (data.evidenceId.startsWith("arena-")) {
      const expectedDisplay = `${evidenceRow.score} ±${evidenceRow.uncertainty}`;
      const expectedStatus = `${evidenceRow.rankMin}–${evidenceRow.rankMax}`;
      if (bar.display !== expectedDisplay) {
        failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的 display 不一致`);
      }
      if (bar.status !== expectedStatus) {
        failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的排名 status 不一致`);
      }
    } else if (typeof evidenceRow.rank === "number" && "score" in evidenceRow) {
      const expectedRank = expectedScoreRank(record.rows, index);
      const expectedStatus = expectedRankStatus(record.rows, index);
      if (evidenceRow.rank !== expectedRank) {
        failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的 rank 不符合分数并列规则`);
      }
      if (bar.status !== expectedStatus) {
        failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的位置没有正确表示并列关系`);
      }
    }
    if (typeof evidenceRow.taskCostUsd === "number") {
      const expectedNote = `$${evidenceRow.taskCostUsd.toFixed(2)} / task`;
      if (bar.note !== expectedNote) {
        failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的单任务成本显示不一致`);
      }
    }
    if (typeof evidenceRow.resolved === "number") {
      const expectedScore = (evidenceRow.resolved / 500) * 100;
      if (!sameNumber(evidenceRow.score, expectedScore)) {
        failures.push(`${relativePath}: ${data.evidenceId} ${bar.label} 的 resolved 数量与百分比不一致`);
      }
    }
  }
}

for (const relativePath of files) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  const match = source.match(/<!-- benchmark-snapshot: (\d{4}-\d{2}-\d{2}) -->/);
  if (!match) {
    failures.push(`${relativePath}: 缺少 benchmark-snapshot 日期`);
    continue;
  }

  const checkedAt = Date.parse(`${match[1]}T00:00:00Z`);
  const rawAgeDays = Math.floor((today - checkedAt) / 86400000);
  const ageDays = Math.max(0, rawAgeDays);
  if (!Number.isFinite(checkedAt) || ageDays > maxAgeDays) {
    failures.push(`${relativePath}: ${match[1]}，距 ${todayText} ${ageDays} 天`);
  }

  const blocks = parseBenchmarkBlocks(source, relativePath);
  for (const block of blocks) {
    const record = validateEvidenceLink(block, relativePath);
    if (!record) continue;
    if (block.type === "benchmark-leaderboard") {
      validateLeaderboard(block.data, record, relativePath);
    } else {
      validateChart(block.data, record, relativePath);
    }
  }
  console.log(`检查：${relativePath} · ${match[1]} · ${ageDays} 天 · ${blocks.length} 个图表`);
}

for (const source of evidence.sources) {
  if (!referencedEvidenceIds.has(source.id)) {
    failures.push(`证据记录未被课程图表引用：${source.id}`);
  }
}

if (failures.length) {
  console.error(`\n模型榜单页面与仓库证据记录检查失败（${failures.length} 项）：`);
  for (const item of failures) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`\n模型榜单页面与仓库证据记录一致；未联网核实官方动态页面。检查 ${files.length} 页，阈值 ${maxAgeDays} 天。`);
}
