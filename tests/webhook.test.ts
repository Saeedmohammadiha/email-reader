import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApi } from "../src/api.js";
import { ResendAdapter } from "../src/adapters/resend.js";
import { completion, mockFetch, temporaryDirectory, unrelatedClassification } from "./helpers.js";

async function post(app: ReturnType<typeof createApi>, body: object) {
  const response = await app.inject({ method: "POST", url: "/webhook", payload: body });
  return response.statusCode;
}

test("startup and outbound events do no work; retrieval failures are recorded", async (t) => {
  await temporaryDirectory(t);
  let calls = 0;
  mockFetch(t, async () => {
    calls++;
    return Response.json({ message: "unavailable", name: "internal_server_error" }, { status: 500 });
  });
  const handler = createApi(new ResendAdapter("test", "test@example.test"));
  t.after(() => handler.close());
  assert.equal(calls, 0);
  assert.equal(await post(handler, { type: "email.sent" }), 200);
  assert.equal(calls, 0);
  assert.equal(await post(handler, { type: "email.received", data: { email_id: "received-123" } }), 500);
  assert.equal(calls, 1);
  const failure = JSON.parse(await readFile("failures.jsonl", "utf8"));
  assert.equal(failure.step, "receive");
  assert.equal(failure.state.event.data.email_id, "received-123");
});

test("Resend adapts the incoming email and the graph sends through the same adapter", async (t) => {
  await temporaryDirectory(t);
  const modelMessages: Array<Array<{ role: string; content: string }>> = [];
  const sends: Array<{ to: string; subject: string; text: string }> = [];
  let sendFailure = false;
  mockFetch(t, async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "GET" && request.url.includes("received-123")) {
      return Response.json({ id: "received-123", from: "customer@example.test", subject: "My invoice", text: "Please explain my invoice.", html: null });
    }
    const body = await request.json();
    if (new URL(request.url).hostname === "model.example.test") {
      modelMessages.push(body.messages);
      return completion(body.response_format ? JSON.stringify(unrelatedClassification) : "Generated Persian reply");
    }
    assert.equal(new URL(request.url).pathname, "/emails");
    sends.push(body);
    return sendFailure
      ? Response.json({ message: "delivery unavailable", name: "internal_server_error" }, { status: 500 })
      : Response.json({ id: "reply-123" });
  });
  const handler = createApi(new ResendAdapter("test", "test@example.test"));
  t.after(() => handler.close());
  const event = { type: "email.received", data: { email_id: "received-123" } };
  assert.equal(await post(handler, event), 200);
  assert.equal(modelMessages.length, 2);
  assert.notEqual(modelMessages[0][0].content, modelMessages[1][0].content);
  assert.match(modelMessages[0][1].content, /Please explain my invoice/);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, "customer@example.test");
  assert.equal(sends[0].subject, "Re: My invoice");
  assert.equal(sends[0].text, "Generated Persian reply");

  sendFailure = true;
  assert.equal(await post(handler, event), 500);
  assert.equal(sends.length, 2);
  const failure = JSON.parse(await readFile("failures.jsonl", "utf8"));
  assert.equal(failure.step, "send");
  assert.equal(failure.state.request.id, "received-123");
  assert.equal(failure.state.responseText, "Generated Persian reply");
});

test("invalid source events and empty email bodies stop before model execution", async (t) => {
  await temporaryDirectory(t);
  let calls = 0;
  mockFetch(t, async (input, init) => {
    const request = new Request(input, init);
    calls++;
    assert.equal(request.method, "GET");
    assert.equal(new URL(request.url).hostname, "api.resend.com");
    return Response.json({ id: "received-123", from: "customer@example.test", subject: "Empty", text: "  ", html: null });
  });
  const handler = createApi(new ResendAdapter("test", "test@example.test"));
  t.after(() => handler.close());
  assert.equal(await post(handler, { type: "email.received" }), 500);
  assert.equal(calls, 0);
  assert.equal(await post(handler, { type: "email.received", data: { email_id: "received-123" } }), 500);
  assert.equal(calls, 1);
  const failures = (await readFile("failures.jsonl", "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(failures.length, 2);
  assert.ok(failures.every((failure) => failure.step === "receive"));
});

test("Fastify rejects unknown routes, malformed JSON, and oversized bodies before intake", async (t) => {
  let receives = 0;
  const app = createApi({
    receive: async () => { receives++; return undefined; },
    sendReply: async () => { assert.fail("must not send for rejected HTTP requests"); },
  });
  t.after(() => app.close());
  assert.equal((await app.inject({ method: "GET", url: "/webhook" })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: "/unknown", payload: {} })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: "/webhook", headers: { "content-type": "application/json" }, payload: '{"type":' })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/webhook", payload: { padding: "x".repeat(1024 * 1024) } })).statusCode, 413);
  assert.equal(receives, 0);
});
