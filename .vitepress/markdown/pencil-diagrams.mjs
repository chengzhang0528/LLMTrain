function encodeSpec(source, name) {
  let spec;
  try {
    spec = JSON.parse(source);
  } catch (error) {
    throw new Error(`${name} 场景必须是有效 JSON：${error.message}`);
  }

  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error(`${name} 场景必须是 JSON 对象`);
  }
  if (!String(spec.ariaLabel ?? "").trim()) {
    throw new Error(`${name} 场景缺少 ariaLabel`);
  }

  return encodeURIComponent(JSON.stringify(spec));
}

export function installPencilDiagrams(md) {
  const fallback = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const type = token.info.trim();

    if (type === "pencil-flow") {
      return `<PencilFlow spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "pencil-vector") {
      return `<PencilVector spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "pencil-formula-plane") {
      return `<PencilFormulaPlane spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "pencil-3d") {
      return `<PencilScene3D spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "model-runtime") {
      return `<ModelRuntimeMap spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "token-compute-tower") {
      return `<TokenComputeTower spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "lesson-board") {
      return `<LessonBoard spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "generation-roadmap") {
      return `<GenerationRoadmap spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "benchmark-chart") {
      return `<BenchmarkBarChart spec="${encodeSpec(token.content, type)}" />`;
    }
    if (type === "benchmark-leaderboard") {
      return `<BenchmarkLeaderboard spec="${encodeSpec(token.content, type)}" />`;
    }
    return fallback
      ? fallback(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
}
