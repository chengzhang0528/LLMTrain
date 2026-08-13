import { formulaReadingMap, normalizeFormulaTex } from "../formula-readings.mjs";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decorate(render, display) {
  return (tokens, index, options, env, self) => {
    const html = render(tokens, index, options, env, self);
    const path = env?.relativePath;
    if (!path) return html;
    const key = `${path}\u0000${display}\u0000${normalizeFormulaTex(tokens[index].content)}`;
    const formula = formulaReadingMap.get(key);
    if (!formula) return html;
    const attributes = [
      `data-formula-reading-id="${escapeAttribute(formula.id)}"`,
      `data-formula-reading="${escapeAttribute(formula.reading)}"`,
    ].join(" ");
    return html.replace(/^<mjx-container /, `<mjx-container ${attributes} `);
  };
}

export function installFormulaReadings(md) {
  const renderInline = md.renderer.rules.math_inline;
  const renderBlock = md.renderer.rules.math_block;
  if (renderInline) md.renderer.rules.math_inline = decorate(renderInline, "inline");
  if (renderBlock) md.renderer.rules.math_block = decorate(renderBlock, "block");
}
