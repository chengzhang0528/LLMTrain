import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "course/06-拓展知识库/模型评测与选型/README.md",
  "course/06-拓展知识库/模型评测与选型/01-先定义模型选择合同.md",
  "course/06-拓展知识库/模型评测与选型/02-把评分指标翻成大白话.md",
  "course/06-拓展知识库/模型评测与选型/03-判断榜单与结论有多可信.md",
  "course/06-拓展知识库/模型评测与选型/04-按应用场景建立候选池.md",
  "course/06-拓展知识库/模型评测与选型/05-2026-08开放权重模型现状.md",
  "course/06-拓展知识库/模型评测与选型/06-不只选择生成模型.md",
  "course/06-拓展知识库/模型评测与选型/07-从公开榜单到本地验收.md"
];

const maxAgeDays = Number(process.env.BENCHMARK_MAX_AGE_DAYS ?? 45);
const todayText = process.env.BENCHMARK_TODAY ?? new Date().toISOString().slice(0, 10);
const today = Date.parse(`${todayText}T00:00:00Z`);
const stale = [];

if (!Number.isFinite(today)) {
  console.error(`无法解析 BENCHMARK_TODAY：${todayText}`);
  process.exit(1);
}

for (const relativePath of files) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  const match = source.match(/<!-- benchmark-snapshot: (\d{4}-\d{2}-\d{2}) -->/);
  if (!match) {
    stale.push(`${relativePath}: 缺少 benchmark-snapshot 日期`);
    continue;
  }

  const checkedAt = Date.parse(`${match[1]}T00:00:00Z`);
  const rawAgeDays = Math.floor((today - checkedAt) / 86400000);
  const ageDays = Math.max(0, rawAgeDays);
  if (!Number.isFinite(checkedAt) || ageDays > maxAgeDays) {
    stale.push(`${relativePath}: ${match[1]}，距 ${todayText} ${ageDays} 天`);
    continue;
  }

  console.log(`通过：${relativePath} · ${match[1]} · ${ageDays} 天`);
}

if (stale.length) {
  console.error(`\n发现 ${stale.length} 个需要复核的模型榜单快照（阈值 ${maxAgeDays} 天）：`);
  for (const item of stale) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`\n模型榜单快照检查通过：${files.length} 页，阈值 ${maxAgeDays} 天。`);
}
