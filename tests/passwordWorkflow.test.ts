import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkflow, PASSWORD_TEMPLATE, MISSING_KNOWLEDGE_TEMPLATE, UNRELATED_TEMPLATE, type Email } from "../src/passwordWorkflow.js";
import { saveFailure } from "../src/localApp.js";

const input = { emailId: "123", sender: "customer@example.test", subject: "Help", content: "How do I change my password?" };

test("routes requests, selects templates, and sends only generated replies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "password-flow-"));
  const path = join(dir, "knowledge.txt");
  try {
    await writeFile(path, "Use the account settings page.");
    for (const [route, expected] of [["password", PASSWORD_TEMPLATE], ["unrelated", UNRELATED_TEMPLATE], ["uncertain", undefined]] as const) {
      const generated: string[] = [];
      const sent: string[] = [];
      const graph = createWorkflow({
        knowledgePath: path,
        classify: async () => ({ route }),
        generate: async (template, _email, knowledge) => {
          generated.push(template);
          if (route === "password") assert.equal(knowledge, "Use the account settings page.");
          return "Generated response";
        },
        send: async (_email, response) => { sent.push(response); },
        fail: async () => { assert.fail("unexpected failure"); },
      });
      await graph.invoke(input);
      assert.deepEqual(generated, expected ? [expected] : []);
      assert.deepEqual(sent, expected ? ["Generated response"] : []);
    }
    await rm(path);
    let selected = "";
    const graph = createWorkflow({
      knowledgePath: path,
      classify: async () => ({ route: "password" }),
      generate: async (template) => { selected = template; return "No knowledge available"; },
      send: async () => {},
      fail: async () => { assert.fail("unexpected failure"); },
    });
    await graph.invoke(input);
    assert.equal(selected, MISSING_KNOWLEDGE_TEMPLATE);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("saves the state and step when sending fails", async () => {
  let failure: { step: string; state: Partial<Email> } | undefined;
  const graph = createWorkflow({
    knowledgePath: "unused",
    classify: async () => ({ route: "unrelated" }),
    generate: async () => "Reply",
    send: async () => { throw new Error("send failed"); },
    fail: async (step, state) => { failure = { step, state }; },
  });
  await assert.rejects(graph.invoke(input), /send failed/);
  assert.equal(failure?.step, "send");
  assert.equal(failure?.state.content, input.content);
  assert.equal(failure?.state.response, "Reply");
  assert.equal(failure?.state.classification?.route, "unrelated");
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

