import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLocalApp } from "../src/localApp.js";
import { createModel } from "../src/model.js";

async function post(handler: ReturnType<typeof createLocalApp>, body: object) {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: "POST", url: "/webhook" }) as IncomingMessage;
  let status = 0;
  const res = { writeHead(code: number) { status = code; return this; }, end() { return this; } } as unknown as ServerResponse;
  await handler(req, res);
  return status;
}

test("webhook retrieves received emails and records failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "webhook-"));
  const previous = process.cwd();
  const originalFetch = globalThis.fetch;
  try {
    process.chdir(dir);
    let fetched = "";
    globalThis.fetch = async (url) => {
      fetched = String(url);
      return new Response(JSON.stringify({ message: "unavailable", name: "internal_server_error" }), { status: 500, headers: { "content-type": "application/json" } });
    };
    const handler = createLocalApp({ resendKey: "test", emailAddress: "test@example.test", model: createModel({ modelUrl: "http://localhost:1234", modelKey: "test", modelName: "test" }) });
    assert.equal(fetched, "", "creating the app must not retrieve an email or call the model");
    assert.equal(await post(handler, { type: "email.sent" }), 200);
    assert.equal(fetched, "", "outbound email events must not start the workflow");
    assert.equal(await post(handler, { type: "email.received", data: { email_id: "received-123" } }), 500);
    assert.match(fetched, /received-123/);
    const failure = JSON.parse(await readFile("failures.jsonl", "utf8"));
    assert.equal(failure.step, "retrieve");
    assert.equal(failure.state.emailId, "received-123");
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(previous);
    await rm(dir, { recursive: true, force: true });
  }
});

test("webhook runs node-built model messages and reports delivery failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "webhook-roundtrip-"));
  const previous = process.cwd();
  const originalFetch = globalThis.fetch;
  const modelMessages: Array<Array<{ role: string; content: string }>> = [];
  const sends: Array<{ to: string; subject: string; text: string }> = [];
  let sendFailure = false;
  try {
    process.chdir(dir);
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "GET" && request.url.includes("received-123")) {
        return Response.json({ id: "received-123", from: "customer@example.test", subject: "My invoice", text: "Please explain my invoice.", html: null });
      }
      const body = await request.json();
      if (new URL(request.url).hostname === "localhost") {
        modelMessages.push(body.messages);
        const message = body.response_format
          ? { role: "assistant", content: JSON.stringify({ intent: "billing", urgency: "low", flow: "unrelated", topic: "invoice", summary: "Invoice question" }) }
          : { role: "assistant", content: "Generated Persian reply" };
        return Response.json({ id: "completion-123", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message, finish_reason: "stop" }] });
      }
      assert.equal(new URL(request.url).pathname, "/emails");
      sends.push(body);
      if (sendFailure) return Response.json({ message: "delivery unavailable", name: "internal_server_error" }, { status: 500 });
      return Response.json({ id: "reply-123" });
    };
    const handler = createLocalApp({ resendKey: "test", emailAddress: "test@example.test", model: createModel({ modelUrl: "http://localhost:1234/v1", modelKey: "test", modelName: "test" }) });
    assert.equal(await post(handler, { type: "email.received", data: { email_id: "received-123" } }), 200);
    assert.equal(modelMessages.length, 2);
    assert.equal(modelMessages[0][0].role, "system");
    assert.equal(modelMessages[1][0].role, "system");
    assert.notEqual(modelMessages[0][0].content, modelMessages[1][0].content);
    assert.match(modelMessages[0][1].content, /Please explain my invoice/);
    assert.match(modelMessages[1][1].content, /Please explain my invoice/);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].to, "customer@example.test");
    assert.equal(sends[0].subject, "Re: My invoice");
    assert.equal(sends[0].text, "Generated Persian reply");

    sendFailure = true;
    assert.equal(await post(handler, { type: "email.received", data: { email_id: "received-123" } }), 500);
    assert.equal(sends.length, 2);
    const failure = JSON.parse(await readFile("failures.jsonl", "utf8"));
    assert.equal(failure.step, "send");
    assert.equal(failure.state.emailId, "received-123");
    assert.equal(failure.state.responseText, "Generated Persian reply");
    assert.match(failure.error, /delivery unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(previous);
    await rm(dir, { recursive: true, force: true });
  }
});
