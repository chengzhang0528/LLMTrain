const FEEDBACK_WORKER_URL =
  "https://llmtrain-feedback.llmtrain-learning-site-1.workers.dev/feedback";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/feedback") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }

    return fetch(new Request(FEEDBACK_WORKER_URL, request));
  }
};
