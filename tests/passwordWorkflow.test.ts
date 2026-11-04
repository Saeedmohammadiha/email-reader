import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { stampRetryable } from "@langchain/core/errors";
import { NodeTimeoutError } from "@langchain/langgraph";
import type { EmailClassificationType } from "../src/emailClassification.js";
import { createWorkflow, PASSWORD_TEMPLATE, MISSING_KNOWLEDGE_TEMPLATE, UNRELATED_TEMPLATE, type Email } from "../src/passwordWorkflow.js";
import { saveFailure } from "../src/localApp.js";

const input = { emailId: "123", senderEmail: "customer@example.test", subject: "Help", emailContent: "How do I change my password?" };
const passwordClassification = { intent: "general_question", urgency: "low", flow: "password_guidance", topic: "password reset", summary: "Password help" } as const;
const unrelatedClassification = { intent: "billing", urgency: "low", flow: "unrelated", topic: "invoice", summary: "Billing help" } as const;
const uncertainClassification = { intent: "complex", urgency: "medium", flow: "unrelated", topic: "mixed", summary: "Mixed request" } as const;

test("routes requests, selects templates, and sends only generated replies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "password-flow-"));
  const path = join(dir, "knowledge.txt");
  try {
    await writeFile(path, "Use the account settings page.");
    for (const [classification, expected, promptText] of [
      [passwordClassification, PASSWORD_TEMPLATE, "password guidance"],
      [unrelatedClassification, UNRELATED_TEMPLATE, "outside this password-guidance flow"],
      [{ ...unrelatedClassification, intent: "technical_problem" }, UNRELATED_TEMPLATE, "outside this password-guidance flow"],
      [{ ...unrelatedClassification, intent: "wants_buy" }, UNRELATED_TEMPLATE, "outside this password-guidance flow"],
      [{ ...passwordClassification, flow: "unrelated", topic: "other" }, UNRELATED_TEMPLATE, "outside this password-guidance flow"],
      [{ ...passwordClassification, flow: "unrelated", topic: "password_guidance" }, UNRELATED_TEMPLATE, "outside this password-guidance flow"],
      [{ ...unrelatedClassification, flow: "password_guidance" }, UNRELATED_TEMPLATE, "outside this password-guidance flow"],
      [uncertainClassification, undefined, undefined],
      [{ ...uncertainClassification, flow: "password_guidance" }, undefined, undefined],
      [{ ...passwordClassification, urgency: "critical" }, undefined, undefined],
    ] as const) {
      const generated: string[] = [];
      const prompts: string[] = [];
      const sent: string[] = [];
      const graph = createWorkflow({
        knowledgePath: path,
        classify: async (messages, config) => {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          assert.match(String(messages[0].content), /Classify ISP customer emails/);
          assert.ok(String(messages[1].content).includes(input.emailContent));
          assert.ok(config?.tags?.includes("workflow-test"));
          return classification;
        },
        generate: async (messages, config) => {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          generated.push(String(messages[1].content));
          prompts.push(String(messages[0].content));
          assert.ok(String(messages[1].content).includes(input.emailContent));
          assert.ok(config?.tags?.includes("workflow-test"));
          if (expected === PASSWORD_TEMPLATE) assert.ok(String(messages[1].content).includes("Use the account settings page."));
          return "Generated response";
        },
        send: async (_email, response) => { sent.push(response); },
        fail: async () => { assert.fail("unexpected failure"); },
      });
      const result = await graph.invoke(input, { tags: ["workflow-test"] });
      assert.deepEqual(result.classification, classification);
      assert.equal(generated.length, expected ? 1 : 0);
      if (expected) assert.ok(generated[0].includes(expected));
      assert.deepEqual(prompts.map((prompt) => prompt.includes(promptText ?? "")), expected ? [true] : []);
      assert.deepEqual(sent, expected ? ["Generated response"] : []);
    }
    await rm(path);
    for (const emptyFile of [false, true]) {
      if (emptyFile) await writeFile(path, "  \n");
      let generated = false;
      const graph = createWorkflow({
        knowledgePath: path,
        classify: async () => passwordClassification,
        generate: async (messages) => {
          generated = true;
          assert.ok(String(messages[1].content).includes(MISSING_KNOWLEDGE_TEMPLATE));
          assert.match(String(messages[0].content), /reliable password guidance is unavailable/);
          return "No knowledge available";
        },
        send: async () => {},
        fail: async () => { assert.fail("unexpected failure"); },
      });
      await graph.invoke(input);
      assert.ok(generated);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("saves the state and step when sending fails", async () => {
  let failure: { step: string; state: Partial<Email> } | undefined;
  const graph = createWorkflow({
    knowledgePath: "unused",
    classify: async () => unrelatedClassification,
    generate: async () => "Reply",
    send: async () => { throw new Error("send failed"); },
    fail: async (step, state) => { failure = { step, state }; },
  });
  await assert.rejects(graph.invoke(input), /send failed/);
  assert.equal(failure?.step, "send");
  assert.equal(failure?.state.emailContent, input.emailContent);
  assert.equal(failure?.state.responseText, "Reply");
  assert.equal(failure?.state.classification?.intent, "billing");
});

test("records the exact failed model node without sending a reply", async () => {
  const originalError = new Error("model unavailable");
  let failure: { step: string; state: Partial<Email>; error: unknown } | undefined;
  const graph = createWorkflow({
    knowledgePath: "unused",
    classify: async () => unrelatedClassification,
    generate: async () => { throw originalError; },
    send: async () => { assert.fail("must not send after generation fails"); },
    fail: async (step, state, error) => { failure = { step, state, error }; },
  });
  await assert.rejects(graph.invoke(input), (error) => error instanceof Error && error.cause === originalError);
  assert.equal(failure?.step, "unrelatedResponse");
  assert.equal(failure?.error, originalError);
  assert.deepEqual(failure?.state.classification, unrelatedClassification);
});

test("preserves the original error if failure logging also fails", async (t) => {
  t.mock.method(console, "error", () => {});
  const originalError = new Error("classification failed");
  let attempts = 0;
  const graph = createWorkflow({
    knowledgePath: "unused",
    classify: async () => { throw originalError; },
    generate: async () => { assert.fail("must not generate after classification fails"); },
    send: async () => { assert.fail("must not send after classification fails"); },
    fail: async () => { attempts++; throw new Error("disk full"); },
  });
  await assert.rejects(graph.invoke(input), (error) => error instanceof Error && error.cause === originalError);
  assert.equal(attempts, 1);
});

test("rejects invalid model classification before generating or sending", async () => {
  for (const classification of [
    { intent: "password" },
    { ...passwordClassification, flow: "password reset" },
    { ...passwordClassification, flow: undefined },
  ]) {
    let failedStep = "";
    const graph = createWorkflow({
      knowledgePath: "unused",
      classify: async () => JSON.parse(JSON.stringify(classification)),
      generate: async () => { assert.fail("must not generate from invalid classification"); },
      send: async () => { assert.fail("must not send from invalid classification"); },
      fail: async (step) => { failedStep = step; },
    });
    await assert.rejects(graph.invoke(input), (error) => error instanceof Error && error.cause instanceof Error && error.cause.name === "ZodError");
    assert.equal(failedStep, "classify");
  }
});

test("retries transient model calls and sends the successful response only once", async () => {
  let classifications = 0;
  let generations = 0;
  let sends = 0;
  const graph = createWorkflow({
    knowledgePath: "unused",
    classify: async () => {
      if (++classifications < 3) throw stampRetryable(new Error("temporary classification failure"), true);
      return unrelatedClassification;
    },
    generate: async () => {
      if (++generations < 3) throw stampRetryable(new Error("temporary generation failure"), true);
      return "Recovered reply";
    },
    send: async (_email, response) => { sends++; assert.equal(response, "Recovered reply"); },
    fail: async () => { assert.fail("must not record recovered attempts as failures"); },
  }, { retryPolicy: { initialInterval: 1, jitter: false, logWarning: false } });
  await graph.invoke(input);
  assert.equal(classifications, 3);
  assert.equal(generations, 3);
  assert.equal(sends, 1);
});

test("records one failure after all three model attempts are exhausted", async () => {
  let attempts = 0;
  let failures = 0;
  const originalError = stampRetryable(new Error("model unavailable"), true);
  const graph = createWorkflow({
    knowledgePath: "unused",
    classify: async () => unrelatedClassification,
    generate: async () => { attempts++; throw originalError; },
    send: async () => { assert.fail("must not send after retry exhaustion"); },
    fail: async (step, state, error) => {
      failures++;
      assert.equal(step, "unrelatedResponse");
      assert.deepEqual(state.classification, unrelatedClassification);
      assert.equal(error, originalError);
    },
  }, { retryPolicy: { initialInterval: 1, jitter: false, logWarning: false } });
  await assert.rejects(graph.invoke(input), (error) => error instanceof Error && error.cause === originalError);
  assert.equal(attempts, 3);
  assert.equal(failures, 1);
});

test("model timeouts abort each attempt and stop after three attempts", async () => {
  let attempts = 0;
  let aborts = 0;
  let failures = 0;
  const graph = createWorkflow({
    knowledgePath: "unused",
    classify: async (_messages, config) => {
      attempts++;
      const signal = config?.signal;
      assert.ok(signal);
      return new Promise<EmailClassificationType>((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborts++; reject(signal.reason); }, { once: true });
      });
    },
    generate: async () => { assert.fail("must not generate after classification times out"); },
    send: async () => { assert.fail("must not send after classification times out"); },
    fail: async (step) => { failures++; assert.equal(step, "classify"); },
  }, { timeout: 20, retryPolicy: { initialInterval: 1, jitter: false, logWarning: false } });
  await assert.rejects(graph.invoke(input), (error) => error instanceof Error && error.cause instanceof NodeTimeoutError);
  assert.equal(attempts, 3);
  assert.equal(aborts, 3);
  assert.equal(failures, 1);
});

test("failure log stores full state as JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "failure-log-"));
  const previous = process.cwd();
  try {
    process.chdir(dir);
    await saveFailure("classify", input, new Error("bad model"));
    const record = JSON.parse(await readFile("failures.jsonl", "utf8"));
    assert.equal(record.step, "classify");
    assert.deepEqual(record.state, input);
    assert.match(record.error, /bad model/);
  } finally { process.chdir(previous); await rm(dir, { recursive: true, force: true }); }
});

