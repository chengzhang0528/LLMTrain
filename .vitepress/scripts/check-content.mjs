import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import DOMPurify from "dompurify";
import mermaid from "mermaid";
import { courseLessons } from "../course-data.mjs";
import { wikiAliases, wikiTerms } from "../wiki-terms.mjs";

// Mermaid sanitizes labels while parsing. In Node there is no DOM, so its
// DOMPurify factory has no browser methods; parsing does not emit HTML here.
DOMPurify.addHook ??= () => {};
DOMPurify.sanitize ??= (value) => value;

const root = process.cwd();
const contentRoots = [
  "README.md",
  "00-从这里开始",
  "01-14天理论课",
  "02-第3周实战",
  "03-数学急救包",
  "04-图解与数字漫画",
  "05-速查表",
  "06-拓展知识库",
  "07-来源与质量审计",
  "08-支持课程"
];

const supportImage = "public/support/alipay-reward.jpg";
const supportImageSha256 = "5708EC6CCD7034E541FEE162626616DAC46D647B80E27C9DB501CC1D368949C4";

async function collectMarkdown(entry) {
  const absolute = path.join(root, entry);
  const stat = await import("node:fs/promises").then(({ stat }) => stat(absolute));
  if (stat.isFile()) return absolute.endsWith(".md") ? [absolute] : [];

  const files = [];
  for (const item of await readdir(absolute, { withFileTypes: true })) {
    if (item.name === ".venv" || item.name === "outputs") continue;
    const child = path.join(absolute, item.name);
    if (item.isDirectory()) files.push(...(await collectMarkdown(path.relative(root, child))));
    else if (item.isFile() && item.name.endsWith(".md")) files.push(child);
  }
  return files;
}

function extractFences(source, relativePath) {
  const fences = [];
  const lines = source.split(/\r?\n/);
  let open = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!open) {
      const match = line.match(/^```([^\s]*)/);
      if (match) open = { language: match[1], start: index + 1, lines: [] };
      continue;
    }

    if (/^```\s*$/.test(line)) {
      fences.push({ ...open, content: open.lines.join("\n") });
      open = null;
    } else {
      open.lines.push(line);
    }
  }

  if (open) throw new Error(`${relativePath}:${open.start} 存在未闭合代码块`);
  return fences;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

const markdownFiles = (await Promise.all(contentRoots.map(collectMarkdown))).flat();
const errors = [];
let mermaidCount = 0;
let mathBlockCount = 0;

for (const file of markdownFiles) {
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");

  if (/[锛鏄鍙�]/u.test(source)) {
    errors.push(`${relativePath}: 发现疑似乱码`);
  }

  let fences;
  try {
    fences = extractFences(source, relativePath);
  } catch (error) {
    errors.push(error.message);
    fences = [];
  }

  for (const fence of fences.filter((item) => item.language === "mermaid")) {
    mermaidCount += 1;
    try {
      await mermaid.parse(fence.content);
    } catch (error) {
      errors.push(`${relativePath}:${fence.start} Mermaid 解析失败：${error.message}`);
    }
  }

  const withoutCode = source.replace(/```[\s\S]*?```/g, "");
  const mathDelimiters = withoutCode.match(/\$\$/g)?.length ?? 0;
  if (mathDelimiters % 2 !== 0) {
    errors.push(`${relativePath}: 块级公式 $$ 未成对`);
  }
  mathBlockCount += mathDelimiters / 2;

  for (const match of source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (/^(https?:\/\/|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.split("#")[0]).replace(/^<|>$/g, "");
    const resolved = path.resolve(path.dirname(file), target);
    if (!(await exists(resolved))) {
      errors.push(`${relativePath}: 本地链接不存在 -> ${target}`);
    }
  }
}

for (const lesson of courseLessons) {
  if (!(await exists(path.join(root, lesson.source)))) {
    errors.push(`课程清单缺少文件：${lesson.source}`);
  }
}

const theoryCount = courseLessons.filter((lesson) => lesson.phase === "理论").length;
const practiceCount = courseLessons.filter((lesson) => lesson.phase === "实践").length;
if (theoryCount !== 14 || practiceCount !== 7) {
  errors.push(`课程天数异常：理论 ${theoryCount}，实践 ${practiceCount}`);
}

const glossary = await readFile(path.join(root, "05-速查表/术语速查.md"), "utf8");
const anchors = new Set();
for (const term of wikiTerms) {
  if (anchors.has(term.anchor)) errors.push(`Wiki 锚点重复：${term.anchor}`);
  anchors.add(term.anchor);

  if (term.href !== `/05-速查表/术语速查#${term.anchor}`) {
    errors.push(`Wiki 目标异常：${term.term} -> ${term.href}`);
  }
  if (!glossary.includes(`id="${term.anchor}"`)) {
    errors.push(`术语速查缺少锚点：${term.anchor}`);
  }
  if (!term.summary.trim() || !term.misconception.trim()) {
    errors.push(`Wiki 预览内容不完整：${term.term}`);
  }
}

const aliases = new Map();
for (const { alias, term } of wikiAliases) {
  const normalized = alias.toLocaleLowerCase("en-US");
  const existing = aliases.get(normalized);
  if (existing && existing !== term.term) {
    errors.push(`Wiki 别名冲突：${alias} 同时指向 ${existing} 和 ${term.term}`);
  }
  aliases.set(normalized, term.term);
}

if (!(await exists(path.join(root, supportImage)))) {
  errors.push(`缺少原样打赏图片：${supportImage}`);
} else {
  const actualHash = createHash("sha256")
    .update(await readFile(path.join(root, supportImage)))
    .digest("hex")
    .toUpperCase();
  if (actualHash !== supportImageSha256) {
    errors.push(`打赏图片不是原始文件：${supportImage}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `内容检查通过：${markdownFiles.length} 篇 Markdown，` +
  `${mermaidCount} 个 Mermaid 图，${mathBlockCount} 个块级公式，` +
  `${courseLessons.length} 天课程，${wikiTerms.length} 个 Wiki 术语，打赏原图校验通过。`
);
