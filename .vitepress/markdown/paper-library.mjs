export function validatePaperCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.papers)) {
    return ["必须包含 papers 数组"];
  }
  if (!String(catalog.updated ?? "").trim()) errors.push("缺少核查日期");

  const ids = new Set();
  for (const [index, paper] of catalog.papers.entries()) {
    const label = `第 ${index + 1} 项`;
    if (!paper || typeof paper !== "object") {
      errors.push(`${label} 不是对象`);
      continue;
    }
    if (!String(paper.id ?? "").trim() || ids.has(paper.id)) errors.push(`${label} id 缺失或重复`);
    ids.add(paper.id);
    for (const field of ["family", "title", "kind", "evidence", "level", "url", "note"]) {
      if (!String(paper[field] ?? "").trim()) errors.push(`${label} 缺少 ${field}`);
    }
    if (!Number.isInteger(paper.year) || paper.year < 2020 || paper.year > 2100) errors.push(`${label} year 异常`);
    if (!Array.isArray(paper.topics) || !paper.topics.length) errors.push(`${label} 至少需要一个研究问题标签`);
    if (!/^https:\/\//.test(String(paper.url ?? ""))) errors.push(`${label} URL 必须使用 HTTPS`);
  }
  return errors;
}

function encodeCatalog(source) {
  let catalog;
  try {
    catalog = JSON.parse(source);
  } catch (error) {
    throw new Error(`paper-library 必须是有效 JSON：${error.message}`);
  }

  const errors = validatePaperCatalog(catalog);
  if (errors.length) throw new Error(`paper-library ${errors[0]}`);

  return encodeURIComponent(JSON.stringify(catalog));
}

export function installPaperLibrary(md) {
  const fallback = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token.info.trim() === "paper-library") {
      return `<PaperLibrary spec="${encodeCatalog(token.content)}" />`;
    }

    return fallback
      ? fallback(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
}
