# LLMTrain Repository Rules

## Product Boundary

- This repository is a beginner-facing tutorial. Improve explanations and guided practice; do not perform the learner's model training unless the user explicitly asks.
- Curated Markdown is the course content source. Do not duplicate lesson prose into frontend components.

## Wiki Invariant

- `.vitepress/wiki-terms.mjs` is the canonical registry for automatic term links and hover previews.
- Every registered term must have a matching stable `term-*` anchor in `05-速查表/术语速查.md`.
- When new course content introduces a reusable technical term, update the registry and glossary in the same change.
- Keep aliases precise. Avoid generic words that would turn ordinary prose into excessive links.
- Do not manually add localhost URLs. Use relative Markdown links for authored content.
- Automatic links must continue to skip headings, code, and existing links.

## Support Page Asset

- `public/support/alipay-reward.jpg` is a user-provided payment image and must remain byte-identical; do not crop, compress, recolor, redraw, or replace it.
- Keep the support page at `/08-支持课程/` and keep the right-edge floating support entry available on course pages.

## Feedback Entry

- Keep a global right-edge feedback entry that accepts a category and one short comment, then creates an Issue in `chengzhang0528/LLMTrain` through the feedback Worker with the current page context.
- The course site remains static. Keep the GitHub token only in the Worker secret store, never expose it to frontend code, and show accurate submitting, success, rate-limit, and failure states.

## Verification

- Run `pnpm docs:check` and `pnpm docs:build` after content or site changes.
- For interaction changes, verify hover/focus previews and mobile layout in a real browser.
- Human-facing details live in `internal/来源与质量审计/内容编写规范.md`; keep it synchronized with these rules.
