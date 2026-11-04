import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChannelAdapter, IncomingRequest } from "../src/adapters/types.js";

export const input: IncomingRequest = {
  id: "123", sender: "customer@example.test", subject: "Help", content: "How do I change my password?",
};
export const passwordClassification = { intent: "general_question", urgency: "low", flow: "password_guidance", topic: "password reset", summary: "Password help" } as const;
export const unrelatedClassification = { intent: "billing", urgency: "low", flow: "unrelated", topic: "invoice", summary: "Billing help" } as const;
export const uncertainClassification = { intent: "complex", urgency: "medium", flow: "unrelated", topic: "mixed", summary: "Mixed request" } as const;

type ModelRequest = {
  messages: Array<{ role: string; content: string }>;
  response_format?: unknown;
};

export function completion(content: string) {
  return Response.json({ id: "completion-123", object: "chat.completion", created: 0, model: "test",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  });
}

export function mockModel(t: TestContext, handle: (body: ModelRequest, request: Request) => Response | Promise<Response>) {
  mockFetch(t, async (input, init) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).hostname, "model.example.test");
    return handle(await request.json(), request);
  });
}

let fetchHandler: typeof fetch | undefined;
const dispatchFetch: typeof fetch = (input, init) => {
  if (!fetchHandler) throw new Error("Unexpected HTTP request outside a test fixture");
  return fetchHandler(input, init);
};

export function mockFetch(t: TestContext, handle: typeof fetch) {
  const previousFetch = globalThis.fetch;
  const previousHandler = fetchHandler;
  fetchHandler = handle;
  globalThis.fetch = dispatchFetch;
  t.after(() => { fetchHandler = previousHandler; globalThis.fetch = previousFetch; });
}

export async function temporaryDirectory(t: TestContext) {
  const previous = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), "email-reader-"));
  process.chdir(directory);
  t.after(async () => { process.chdir(previous); await rm(directory, { recursive: true, force: true }); });
  return directory;
}

export function recordingAdapter() {
  const sent: Array<{ request: IncomingRequest; response: string }> = [];
  const adapter: ChannelAdapter = {
    receive: async () => undefined,
    sendReply: async (request, response) => { sent.push({ request, response }); },
  };
  return { adapter, sent };
}
