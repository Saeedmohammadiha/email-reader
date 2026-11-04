import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIClient, wrapOpenAIClientError } from "@langchain/openai";
import { createModel, isRetryableModelError } from "../src/model.js";

test("retries transient provider errors but rejects permanent and validation errors", () => {
  for (const status of [408, 429, 500, 503]) {
    const error = OpenAIClient.APIError.generate(status, { error: { message: "temporary" } }, "temporary", new Headers());
    assert.equal(isRetryableModelError(wrapOpenAIClientError(error)), true);
  }
  for (const status of [400, 401, 403, 404, 422]) {
    const error = OpenAIClient.APIError.generate(status, { error: { message: "permanent" } }, "permanent", new Headers());
    assert.equal(isRetryableModelError(wrapOpenAIClientError(error)), false);
  }
  const quotaError = OpenAIClient.APIError.generate(429, { error: { code: "insufficient_quota", message: "quota exhausted" } }, "quota exhausted", new Headers());
  assert.equal(isRetryableModelError(wrapOpenAIClientError(quotaError)), false);
  assert.equal(isRetryableModelError(new OpenAIClient.APIConnectionError({})), true);
  assert.equal(isRetryableModelError(wrapOpenAIClientError(new OpenAIClient.APIConnectionTimeoutError())), true);
  assert.equal(isRetryableModelError(new Error("invalid model output")), false);
  assert.equal(isRetryableModelError(wrapOpenAIClientError(new OpenAIClient.APIUserAbortError())), false);
});

test("the model client does not retry independently of LangGraph", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ error: { message: "temporarily unavailable" } }, { status: 503 });
    };
    const model = createModel({ modelName: "test", modelKey: "test", modelUrl: "http://localhost:1234/v1" });
    await assert.rejects(model.invoke("Test retry ownership"), { status: 503 });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
