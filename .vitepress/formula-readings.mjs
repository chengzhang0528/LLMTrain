function defineFormula(id, path, display, tex, reading) {
  return { id, path, display, tex, reading };
}

export function normalizeFormulaTex(tex) {
  return tex.replace(/\s+/g, "").trim();
}

// Only formulas whose spoken form has been reviewed belong here. Unregistered
// MathJax expressions deliberately receive no play button.
export const formulaReadings = [
  defineFormula(
    "vector-l2-norm",
    "03-数学急救包/02-向量、矩阵与点积.md",
    "inline",
    String.raw`\lVert b\rVert_2=\sqrt{\sum_{i=1}^{d}b_i^2}`,
    "b 的二范数，等于根号下，从 i 等于一到 d，对 b 下标 i 的平方求和",
  ),
  defineFormula(
    "cosine-similarity",
    "03-数学急救包/02-向量、矩阵与点积.md",
    "block",
    String.raw`\cos(a,b)=\frac{a\cdot b}{\lVert a\rVert_2\lVert b\rVert_2}.`,
    "a 和 b 的余弦相似度，等于 a 点乘 b，除以 a 的二范数乘 b 的二范数",
  ),
  defineFormula(
    "matrix-linear-map-example",
    "03-数学急救包/02-向量、矩阵与点积.md",
    "block",
    String.raw`x=[2,1],\quad
W=\begin{bmatrix}
1&0&-1\\
0&2&1
\end{bmatrix}.`,
    "x 等于向量二、一。W 等于二行三列矩阵：第一行一、零、负一；第二行零、二、一",
  ),
  defineFormula(
    "linear-output-coordinate",
    "03-数学急救包/02-向量、矩阵与点积.md",
    "block",
    String.raw`y_j=\sum_{i=1}^{D_{in}}x_iW_{ij}.`,
    "y 下标 j，等于从 i 等于一到 D 下标 in，对 x 下标 i 乘 W 下标 i j 求和",
  ),
];

export const formulaReadingMap = new Map(
  formulaReadings.map((formula) => [
    `${formula.path}\u0000${formula.display}\u0000${normalizeFormulaTex(formula.tex)}`,
    formula,
  ]),
);
