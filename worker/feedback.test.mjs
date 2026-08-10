import assert from "node:assert/strict";
import worker from "./feedback.mjs";

const origin = "https://chengzhang0528.github.io";
const env = {
  ALLOWED_ORIGINS: origin,
  GITHUB_OWNER: "chengzhang0528",
  GITHUB_REPO: "LLMTrain",
  GITHUB_TOKEN: "test-token",
  RATE_LIMITER: {
    idFromName(value) {
      assert.equal(value, "203.0.113.8");
      return "rate-limit-id";
    },
    get(value) {
      assert.equal(value, "rate-limit-id");
      return { fetch: async () => new Response(JSON.stringify({ allowed: true }), { status: 200 }) };
    }
  }
};

function feedbackRequest(payload, requestOrigin = origin) {
  return new Request("https://feedback.example/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.8",
      origin: requestOrigin
    },
    body: JSON.stringify(payload)
  });
}

const originalFetch = globalThis.fetch;
try {
  const rejectedOrigin = await worker.fetch(feedbackRequest({}, "https://example.com"), env);
  assert.equal(rejectedOrigin.status, 403);

  const missingMessage = await worker.fetch(
    feedbackRequest({ type: "内容勘误", pageTitle: "D03", pageUrl: "https://example.com/lesson" }),
    env
  );
  assert.equal(missingMessage.status, 400);

  let githubRequest;
  globalThis.fetch = async (url, init) => {
    githubRequest = { url, init };
    return new Response(JSON.stringify({ number: 42, html_url: "https://github.com/example/issues/42" }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  };

  const created = await worker.fetch(
    feedbackRequest({
      type: "功能建议",
      message: "希望增加复习筛选。",
      pageTitle: "学习记录",
      pageUrl: "https://chengzhang0528.github.io/LLMTrain/lesson"
    }),
    env
  );
  const createdBody = await created.json();
  assert.equal(created.status, 201);
  assert.deepEqual(createdBody, {
    ok: true,
    issueNumber: 42,
    issueUrl: "https://github.com/example/issues/42"
  });
  assert.equal(githubRequest.url, "https://api.github.com/repos/chengzhang0528/LLMTrain/issues");
  assert.equal(githubRequest.init.headers.authorization, "Bearer test-token");
  assert.match(JSON.parse(githubRequest.init.body).body, /学习记录/);

  globalThis.fetch = async () => new Response(null, { status: 403 });
  const denied = await worker.fetch(
    feedbackRequest({
      type: "其他",
      message: "权限检查",
      pageTitle: "LLMTrain",
      pageUrl: "https://chengzhang0528.github.io/LLMTrain/"
    }),
    env
  );
  assert.equal(denied.status, 502);
  assert.deepEqual(await denied.json(), {
    code: "GITHUB_PERMISSION_DENIED",
    error: "反馈服务没有创建 Issue 的权限，请联系课程维护者"
  });

  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };
  const unavailable = await worker.fetch(
    feedbackRequest({
      type: "其他",
      message: "网络检查",
      pageTitle: "LLMTrain",
      pageUrl: "https://chengzhang0528.github.io/LLMTrain/"
    }),
    env
  );
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), {
    code: "GITHUB_NETWORK_FAILED",
    error: "反馈服务暂时无法连接 GitHub，请稍后再试"
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log("反馈 Worker 检查通过");
