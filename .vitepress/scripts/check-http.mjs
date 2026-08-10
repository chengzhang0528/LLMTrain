import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, ".vitepress", "dist");
const baseUrl = new URL(process.argv[2] || "http://127.0.0.1:4173/");
const require = createRequire(import.meta.resolve("markdown-it-mathjax3"));
const cheerio = require("cheerio");

function walkHtml(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(target));
    else if (entry.isFile() && target.endsWith(".html")) files.push(target);
  }
  return files;
}

function routeFromFile(file) {
  const relative = path.relative(distRoot, file).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative.slice(0, -".html".length)}`;
}

function isLocalAsset(rawUrl) {
  if (!rawUrl || rawUrl.startsWith("//") || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) return false;
  const url = new URL(rawUrl, baseUrl);
  return url.origin === baseUrl.origin;
}

async function runPool(items, worker, concurrency = 12) {
  let cursor = 0;
  const failures = [];
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await worker(items[index]);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return failures;
}

const htmlFiles = walkHtml(distRoot).filter((file) => path.basename(file) !== "404.html");
const routes = htmlFiles.map(routeFromFile);
const assetPaths = new Set();

for (const file of htmlFiles) {
  const $ = cheerio.load(fs.readFileSync(file, "utf8"));
  const selectors = [["img[src]", "src"], ["source[src]", "src"], ["video[poster]", "poster"], ["script[src]", "src"], ["link[href]", "href"]];
  for (const [selector, attribute] of selectors) {
    $(selector).each((_, element) => {
      const rawUrl = $(element).attr(attribute)?.trim();
      if (!isLocalAsset(rawUrl)) return;
      const url = new URL(rawUrl, baseUrl);
      assetPaths.add(`${url.pathname}${url.search}`);
    });
  }
}

const pageFailures = await runPool(routes, async (route) => {
  const response = await fetch(new URL(encodeURI(route), baseUrl), { redirect: "follow" });
  const body = await response.text();
  if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.includes("text/html")) throw new Error(`${route}: not HTML`);
  if (/404 Page not found|页面未找到|Page Not Found/iu.test(body)) throw new Error(`${route}: contains 404 page content`);
  if (!/<main[\s>]/iu.test(body)) throw new Error(`${route}: response has no main content`);
});

const assetFailures = await runPool([...assetPaths], async (assetPath) => {
  const response = await fetch(new URL(assetPath, baseUrl), { redirect: "follow" });
  await response.body?.cancel();
  if (response.status !== 200) throw new Error(`${assetPath}: HTTP ${response.status}`);
});

const failures = [...pageFailures, ...assetFailures];
if (failures.length) {
  for (const failure of failures) console.error(`[http] ERROR ${failure}`);
  console.error(`[http] Failed with ${failures.length} error(s).`);
  process.exit(1);
}

console.log(`[http] OK: ${routes.length} routes and ${assetPaths.size} unique assets from ${baseUrl.href}`);
