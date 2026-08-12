import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, ".vitepress", "dist");
const require = createRequire(import.meta.resolve("markdown-it-mathjax3"));
const cheerio = require("cheerio");

const leakagePatterns = [
  /来源与质量审计/u,
  /内容编写规范/u,
  /教学动效审计/u,
  /Kimi-K3-素材审计/iu,
  /内部生产/u,
  /仅供内部/u,
  /课程生产规范/u
];

const ignoredProtocols = new Set(["mailto:", "tel:", "javascript:", "data:", "blob:"]);
const errors = [];
const warnings = [];
let checkedLinks = 0;
let checkedAssets = 0;

function walkFiles(root, extension) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(target, extension));
    else if (entry.isFile() && target.endsWith(extension)) files.push(target);
  }
  return files;
}

function relativeDist(file) {
  return path.relative(distRoot, file).split(path.sep).join("/");
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function parseLocalUrl(rawUrl, sourceFile) {
  if (!rawUrl || rawUrl.startsWith("//")) return null;
  let parsed;
  try {
    const sourceRoute = `/${relativeDist(sourceFile)}`;
    parsed = new URL(rawUrl, `https://llmtrain.local${sourceRoute}`);
  } catch {
    return null;
  }
  if (parsed.origin !== "https://llmtrain.local" || ignoredProtocols.has(parsed.protocol)) return null;
  return parsed;
}

function pathnameToFile(pathname, { route = false } = {}) {
  const decoded = decodePathname(pathname).replace(/^\/+/, "");
  if (!decoded) return path.join(distRoot, "index.html");
  const normalized = path.normalize(decoded);
  const exact = path.join(distRoot, normalized);
  const candidates = route
    ? decoded.endsWith("/")
      ? [path.join(distRoot, normalized, "index.html")]
      : decoded.toLowerCase().endsWith(".html")
        ? [exact]
        : [`${exact}.html`, path.join(exact, "index.html")]
    : [decoded.endsWith("/") ? path.join(distRoot, normalized, "index.html") : exact];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? candidates[0];
}

function anchorFromHash(hash) {
  if (!hash) return "";
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

if (!fs.existsSync(distRoot)) {
  console.error("[dist] Missing .vitepress/dist. Run pnpm docs:build first.");
  process.exit(1);
}

const htmlFiles = walkFiles(distRoot, ".html");
const htmlCache = new Map();

function loadHtml(file) {
  if (!htmlCache.has(file)) {
    const source = fs.readFileSync(file, "utf8");
    htmlCache.set(file, { source, $: cheerio.load(source) });
  }
  return htmlCache.get(file);
}

for (const file of htmlFiles) {
  const relative = relativeDist(file);
  const { source, $ } = loadHtml(file);
  const is404 = relative === "404.html";
  const title = $("title").first().text().trim();
  const doc = $(".vp-doc").first();
  const main = doc.length ? doc : $("main").first();
  const mainText = main.text().replace(/\s+/gu, " ").trim();

  if (!title) errors.push(`${relative}: empty <title>`);
  if (!is404 && !main.length) errors.push(`${relative}: missing main content container`);
  if (!is404 && mainText.length < 12) errors.push(`${relative}: empty or near-empty main content`);
  if (!is404 && !main.find("h1").length) errors.push(`${relative}: missing h1 in main content`);

  for (const pattern of leakagePatterns) {
    if (pattern.test(source)) errors.push(`${relative}: contains internal-only marker ${pattern}`);
  }

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();
    const parsed = parseLocalUrl(href, file);
    if (!parsed) return;
    checkedLinks += 1;
    const target = pathnameToFile(parsed.pathname, { route: true });
    if (!fs.existsSync(target)) {
      errors.push(`${relative}: broken internal link ${href}`);
      return;
    }
    const anchor = anchorFromHash(parsed.hash);
    if (!anchor) return;
    const { $: targetPage } = loadHtml(target);
    const ids = new Set(targetPage("[id]").map((__, node) => targetPage(node).attr("id")).get());
    if (!ids.has(anchor)) errors.push(`${relative}: missing anchor ${href}`);
  });

  const assetSelectors = [
    ["img[src]", "src"],
    ["source[src]", "src"],
    ["video[poster]", "poster"],
    ["script[src]", "src"],
    ["link[href]", "href"]
  ];
  for (const [selector, attribute] of assetSelectors) {
    $(selector).each((_, element) => {
      const assetUrl = $(element).attr(attribute)?.trim();
      const parsed = parseLocalUrl(assetUrl, file);
      if (!parsed) return;
      checkedAssets += 1;
      const target = pathnameToFile(parsed.pathname);
      if (!fs.existsSync(target)) errors.push(`${relative}: missing local asset ${assetUrl}`);
    });
  }
}

for (const warning of warnings) console.warn(`[dist] WARN ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`[dist] ERROR ${error}`);
  console.error(`[dist] Failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `[dist] OK: ${htmlFiles.length} HTML pages, ${checkedLinks} internal links, ${checkedAssets} local asset references.`
);
