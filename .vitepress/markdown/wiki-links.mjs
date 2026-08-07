import { wikiAliases } from "../wiki-terms.mjs";

const aliasMap = new Map(
  wikiAliases.map(({ alias, term }) => [alias.toLocaleLowerCase("en-US"), term])
);
const aliases = [...aliasMap.keys()].sort((left, right) => right.length - left.length);
const aliasPattern = new RegExp(aliases.map(escapeRegExp).join("|"), "giu");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiWordCharacter(value) {
  return Boolean(value && /[A-Za-z0-9_]/.test(value));
}

function hasValidBoundary(source, index, value) {
  if (!/[A-Za-z0-9_]/.test(value)) return true;
  return (
    !isAsciiWordCharacter(source[index - 1]) &&
    !isAsciiWordCharacter(source[index + value.length])
  );
}

function createTextToken(Token, content) {
  const token = new Token("text", "", 0);
  token.content = content;
  return token;
}

function linkWikiTerms(source, Token) {
  const result = [];
  let cursor = 0;
  aliasPattern.lastIndex = 0;

  for (const match of source.matchAll(aliasPattern)) {
    const matchedText = match[0];
    const index = match.index ?? 0;
    if (!hasValidBoundary(source, index, matchedText)) continue;

    const term = aliasMap.get(matchedText.toLocaleLowerCase("en-US"));
    if (!term) continue;

    if (index > cursor) result.push(createTextToken(Token, source.slice(cursor, index)));

    const open = new Token("link_open", "a", 1);
    open.attrSet("href", term.href);
    open.attrSet("class", "wiki-term");
    open.attrSet("data-wiki-title", term.term);
    open.attrSet("data-wiki-summary", term.summary);
    open.attrSet("data-wiki-misconception", term.misconception);
    result.push(open, createTextToken(Token, matchedText));

    const close = new Token("link_close", "a", -1);
    result.push(close);
    cursor = index + matchedText.length;
  }

  if (!result.length) return null;
  if (cursor < source.length) result.push(createTextToken(Token, source.slice(cursor)));
  return result;
}

export function installWikiLinks(md) {
  md.core.ruler.after("inline", "wiki_links", (state) => {
    if (state.env?.relativePath === "05-速查表/术语速查.md") return;

    for (let index = 0; index < state.tokens.length; index += 1) {
      const block = state.tokens[index];
      if (block.type !== "inline" || state.tokens[index - 1]?.type === "heading_open") continue;

      const children = block.children ?? [];
      const transformed = [];
      let linkDepth = 0;

      for (const child of children) {
        if (child.type === "link_open") {
          linkDepth += 1;
          transformed.push(child);
          continue;
        }

        if (child.type === "link_close") {
          transformed.push(child);
          linkDepth = Math.max(0, linkDepth - 1);
          continue;
        }

        if (child.type === "text" && linkDepth === 0) {
          const linked = linkWikiTerms(child.content, state.Token);
          if (linked) {
            transformed.push(...linked);
            continue;
          }
        }

        transformed.push(child);
      }

      block.children = transformed;
    }
  });
}
