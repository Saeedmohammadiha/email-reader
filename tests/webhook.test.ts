import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLocalApp } from "../src/localApp.js";

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
    const handler = createLocalApp({ resendKey: "test", emailAddress: "test@example.test", modelUrl: "http://localhost:1234", modelKey: "test", modelName: "test", systemPrompt: "test" });
    const post = async (body: object) => {
      const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: "POST", url: "/webhook" }) as IncomingMessage;
      let status = 0;
      const res = { writeHead(code: number) { status = code; return this; }, end() { return this; } } as unknown as ServerResponse;
      await handler(req, res);
      return status;
    };
    assert.equal(await post({ type: "email.sent" }), 200);
    assert.equal(await post({ type: "email.received", data: { email_id: "received-123" } }), 500);
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
