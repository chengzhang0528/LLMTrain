const FEEDBACK_TYPES = new Set(["内容勘误", "讲解建议", "使用问题", "功能建议", "其他"]);
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function normalizePageUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function githubError(status) {
  if (status === 401) return { code: "GITHUB_AUTH_INVALID", error: "反馈服务授权已失效，请联系课程维护者" };
  if (status === 403) return { code: "GITHUB_PERMISSION_DENIED", error: "反馈服务没有创建 Issue 的权限，请联系课程维护者" };
  if (status === 404) return { code: "GITHUB_REPOSITORY_UNAVAILABLE", error: "反馈服务无法访问目标仓库，请联系课程维护者" };
  if (status === 422) return { code: "GITHUB_VALIDATION", error: "GitHub 未接受这条反馈，请调整内容后重试" };
  return {
    code: "GITHUB_REQUEST_FAILED",
    error: `GitHub 返回异常状态 ${status}，请稍后再试`
  };
}

export class FeedbackRateLimiter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch() {
    const now = Date.now();
    const stored = await this.ctx.storage.get(["windowStartedAt", "count"]);
    let windowStartedAt = Number(stored.get("windowStartedAt") ?? now);
    let count = Number(stored.get("count") ?? 0);

    if (now - windowStartedAt >= RATE_WINDOW_MS) {
      windowStartedAt = now;
      count = 0;
    }

    if (count >= RATE_LIMIT) {
      const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - windowStartedAt)) / 1000));
      return json({ allowed: false, retryAfter }, 429, { "retry-after": String(retryAfter) });
    }

    await this.ctx.storage.put({ windowStartedAt, count: count + 1 });
    return json({ allowed: true }, 200);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") ?? "";
    if (!allowedOrigins(env).has(origin)) {
      return json({ error: "不允许的请求来源" }, 403);
    }

    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "仅支持 POST 请求" }, 405, cors);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "请求内容不是有效 JSON" }, 400, cors);
    }

    if (String(payload.website ?? "").trim()) {
      return json({ ok: true }, 201, cors);
    }

    const type = String(payload.type ?? "").trim();
    const message = String(payload.message ?? "").replace(/\s+/g, " ").trim();
    const pageTitle = String(payload.pageTitle ?? "LLMTrain").replace(/\s+/g, " ").trim() || "LLMTrain";
    const pageUrl = normalizePageUrl(payload.pageUrl);

    if (!FEEDBACK_TYPES.has(type)) return json({ error: "请选择有效的反馈类型" }, 400, cors);
    if (!message) return json({ error: "请填写一句话反馈" }, 400, cors);
    if (!pageUrl) return json({ error: "来源页面地址无效" }, 400, cors);

    const clientAddress = request.headers.get("cf-connecting-ip") ?? "unknown";
    let limitResponse;
    try {
      const limiterId = env.RATE_LIMITER.idFromName(clientAddress);
      limitResponse = await env.RATE_LIMITER.get(limiterId).fetch("https://rate-limit.internal/check", {
        method: "POST"
      });
    } catch (error) {
      console.error("Feedback rate limiter failed", error instanceof Error ? error.name : "UnknownError");
      return json(
        {
          code: "RATE_LIMITER_FAILED",
          error: "反馈服务限流组件暂时不可用，请稍后再试"
        },
        503,
        cors
      );
    }
    if (!limitResponse.ok) {
      return json({ error: "提交过于频繁，请稍后再试" }, 429, {
        ...cors,
        "retry-after": limitResponse.headers.get("retry-after") ?? "600"
      });
    }

    const issueBody = [
      "## 反馈类型",
      type,
      "",
      "## 一句话反馈",
      message,
      "",
      "## 来源页面",
      `- 页面：${pageTitle}`,
      `- 链接：${pageUrl}`,
      "",
      "> 此内容由 LLMTrain 站内反馈入口生成。"
    ].join("\n");

    let githubResponse;
    try {
      githubResponse = await fetch(
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${env.GITHUB_TOKEN}`,
            "content-type": "application/json",
            "user-agent": "LLMTrain-Feedback-Worker",
            "x-github-api-version": "2022-11-28"
          },
          body: JSON.stringify({
            title: `[${type}] ${message}`,
            body: issueBody
          })
        }
      );
    } catch (error) {
      console.error("GitHub issue request failed before response", error instanceof Error ? error.name : "UnknownError");
      return json(
        {
          code: "GITHUB_NETWORK_FAILED",
          error: "反馈服务暂时无法连接 GitHub，请稍后再试"
        },
        502,
        cors
      );
    }

    if (!githubResponse.ok) {
      const failure = githubError(githubResponse.status);
      console.error("GitHub issue creation failed", githubResponse.status, failure.code);
      return json(failure, 502, cors);
    }

    let issue;
    try {
      issue = await githubResponse.json();
    } catch (error) {
      console.error("GitHub issue response was not JSON", error instanceof Error ? error.name : "UnknownError");
      return json(
        {
          code: "GITHUB_RESPONSE_INVALID",
          error: "GitHub 已响应，但反馈结果无法读取，请联系课程维护者核对 Issue"
        },
        502,
        cors
      );
    }

    if (!Number.isInteger(issue.number) || typeof issue.html_url !== "string") {
      console.error("GitHub issue response was incomplete");
      return json(
        {
          code: "GITHUB_RESPONSE_INCOMPLETE",
          error: "GitHub 已响应，但反馈结果不完整，请联系课程维护者核对 Issue"
        },
        502,
        cors
      );
    }
    return json(
      {
        ok: true,
        issueNumber: issue.number,
        issueUrl: issue.html_url
      },
      201,
      cors
    );
  }
};
