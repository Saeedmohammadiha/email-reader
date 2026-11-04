import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { NodeTimeoutError } from "@langchain/langgraph";
import { workflow } from "../src/workflow.js";
import { PASSWORD_TEMPLATE, MISSING_KNOWLEDGE_TEMPLATE } from "../src/branches/password.js";
import { UNRELATED_TEMPLATE } from "../src/nodes/fallback.js";
import { getModel } from "../src/model.js";
import type { EmailClassificationType } from "../src/nodes/classify.js";
import {
  input, passwordClassification, unrelatedClassification, uncertainClassification,
  completion, mockModel, temporaryDirectory, recordingAdapter,
} from "./helpers.js";

function fastRetries(t: TestContext) {
  for (const name of ["classify", "passwordResponse", "missingKnowledge", "unrelatedResponse"] as const) {
    const node = workflow.nodes[name];
    const previous = node.retryPolicy;
    node.retryPolicy = { ...previous, initialInterval: 1, jitter: false, logWarning: false };
    t.after(() => { node.retryPolicy = previous; });
  }
}

test("one workflow classifies and routes requests through the current branches", async (t) => {
  await temporaryDirectory(t);
  await writeFile("password-knowledge.txt", "Use the account settings page.");
  let classification: EmailClassificationType = passwordClassification;
  const prompts: string[] = [];
  const content: string[] = [];
  mockModel(t, (body) => {
    assert.equal(body.messages[0].role, "system");
    assert.ok(body.messages[1].content.includes(input.content));
    if (body.response_format) return completion(JSON.stringify(classification));
    prompts.push(body.messages[0].content);
    content.push(body.messages[1].content);
    return completion("Generated response");
  });
  const cases = [
    [passwordClassification, PASSWORD_TEMPLATE],
    [unrelatedClassification, UNRELATED_TEMPLATE],
    [{ ...unrelatedClassification, intent: "technical_problem" }, UNRELATED_TEMPLATE],
    [{ ...unrelatedClassification, intent: "wants_buy" }, UNRELATED_TEMPLATE],
    [{ ...passwordClassification, flow: "unrelated", topic: "password_guidance" }, UNRELATED_TEMPLATE],
    [{ ...unrelatedClassification, flow: "password_guidance" }, UNRELATED_TEMPLATE],
    [uncertainClassification, undefined],
    [{ ...passwordClassification, urgency: "critical" }, undefined],
  ] as const;
  for (const [next, template] of cases) {
    classification = next;
    prompts.length = 0;
    content.length = 0;
    const { adapter, sent } = recordingAdapter();
    const result = await workflow.invoke({ request: input }, { context: { adapter } });
    assert.deepEqual(result.classification, classification);
    assert.equal(sent.length, template ? 1 : 0);
    if (template) {
      assert.ok(content[0].includes(template));
      assert.equal(sent[0].response, "Generated response");
      assert.deepEqual(sent[0].request, input);
    }
    if (template === PASSWORD_TEMPLATE) assert.ok(content[0].includes("Use the account settings page."));
  }
  for (const missing of [true, false]) {
    if (missing) await rm("password-knowledge.txt");
    else await writeFile("password-knowledge.txt", " \n");
    classification = passwordClassification;
    const { adapter } = recordingAdapter();
    await workflow.invoke({ request: input }, { context: { adapter } });
    assert.ok(content.at(-1)?.includes(MISSING_KNOWLEDGE_TEMPLATE));
    const prompt = prompts.at(-1);
    assert.ok(prompt);
    assert.match(prompt, /reliable password guidance is unavailable/);
  }
  assert.equal(getModel(), getModel());
});

test("concurrent requests use the same graph with separate request state and adapters", async (t) => {
  mockModel(t, (body) => completion(body.response_format
    ? JSON.stringify(unrelatedClassification)
    : body.messages[1].content.includes("alpha") ? "Reply A" : "Reply B"));
  const first = recordingAdapter();
  const second = recordingAdapter();
  const requestA = { ...input, id: "A", content: "alpha" };
  const requestB = { ...input, id: "B", content: "beta" };
  await Promise.all([
    workflow.invoke({ request: requestA }, { context: { adapter: first.adapter } }),
    workflow.invoke({ request: requestB }, { context: { adapter: second.adapter } }),
  ]);
  assert.deepEqual(first.sent, [{ request: requestA, response: "Reply A" }]);
  assert.deepEqual(second.sent, [{ request: requestB, response: "Reply B" }]);
});

test("send failures record full request state and do not repeat the send", async (t) => {
  await temporaryDirectory(t);
  mockModel(t, (body) => completion(body.response_format ? JSON.stringify(unrelatedClassification) : "Reply"));
  let attempts = 0;
  const { adapter } = recordingAdapter();
  adapter.sendReply = async () => { attempts++; throw new Error("send failed"); };
  await assert.rejects(workflow.invoke({ request: input }, { context: { adapter } }), /send failed/);
  const failure = JSON.parse(await readFile("failures.jsonl", "utf8"));
  assert.equal(failure.step, "send");
  assert.deepEqual(failure.state.request, input);
  assert.equal(failure.state.responseText, "Reply");
  assert.equal(attempts, 1);
});

test("invalid classification stops before drafting or sending", async (t) => {
  await temporaryDirectory(t);
  let calls = 0;
  mockModel(t, () => { calls++; return completion(JSON.stringify({ ...passwordClassification, flow: "password reset" })); });
  const { adapter, sent } = recordingAdapter();
  await assert.rejects(workflow.invoke({ request: input }, { context: { adapter } }));
  assert.equal(calls, 1);
  assert.equal(sent.length, 0);
  assert.equal(JSON.parse(await readFile("failures.jsonl", "utf8")).step, "classify");
});

test("transient model failures retry before sending exactly one reply", async (t) => {
  await temporaryDirectory(t);
  fastRetries(t);
  let classifications = 0;
  let generations = 0;
  mockModel(t, (body) => {
    const attempt = body.response_format ? ++classifications : ++generations;
    if (attempt < 3) return Response.json({ error: { message: "temporary" } }, { status: 503 });
    return completion(body.response_format ? JSON.stringify(unrelatedClassification) : "Recovered reply");
  });
  const { adapter, sent } = recordingAdapter();
  await workflow.invoke({ request: input }, { context: { adapter } });
  assert.equal(classifications, 3);
  assert.equal(generations, 3);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].response, "Recovered reply");
  await assert.rejects(readFile("failures.jsonl"), { code: "ENOENT" });
});

test("retry exhaustion records one final failure and never sends", async (t) => {
  await temporaryDirectory(t);
  fastRetries(t);
  let calls = 0;
  mockModel(t, () => { calls++; return Response.json({ error: { message: "model unavailable" } }, { status: 503 }); });
  const { adapter, sent } = recordingAdapter();
  await assert.rejects(workflow.invoke({ request: input }, { context: { adapter } }), /model unavailable/);
  const records = (await readFile("failures.jsonl", "utf8")).trim().split("\n");
  assert.equal(records.length, 1);
  assert.equal(JSON.parse(records[0]).step, "classify");
  assert.equal(calls, 3);
  assert.equal(sent.length, 0);
});

test("node timeouts abort each model request and stop after three attempts", async (t) => {
  await temporaryDirectory(t);
  fastRetries(t);
  const previous = workflow.nodes.classify.timeout;
  workflow.nodes.classify.timeout = { runTimeout: 20 };
  t.after(() => { workflow.nodes.classify.timeout = previous; });
  let attempts = 0;
  let aborts = 0;
  mockModel(t, (_body, request) => {
    attempts++;
    return new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener("abort", () => { aborts++; reject(request.signal.reason); }, { once: true });
    });
  });
  const { adapter, sent } = recordingAdapter();
  await assert.rejects(workflow.invoke({ request: input }, { context: { adapter } }), (error) => error instanceof Error && error.cause instanceof NodeTimeoutError);
  assert.equal(attempts, 3);
  assert.equal(aborts, 3);
  assert.equal(sent.length, 0);
});

test("failure logging cannot hide the original model error", async (t) => {
  await temporaryDirectory(t);
  await mkdir("failures.jsonl");
  const logging = t.mock.method(console, "error", () => {});
  mockModel(t, () => Response.json({ error: { message: "bad request" } }, { status: 400 }));
  const { adapter, sent } = recordingAdapter();
  await assert.rejects(workflow.invoke({ request: input }, { context: { adapter } }), /bad request/);
  assert.equal(logging.mock.calls.length, 1);
  assert.equal(sent.length, 0);
});
