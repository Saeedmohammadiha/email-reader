import { appendFile } from "node:fs/promises";

export async function saveFailure(step: string, state: unknown, error: unknown) {
  // TODO: Define redaction, retention, rotation, and access controls before logging real customer content.
  await appendFile("failures.jsonl", `${JSON.stringify({
    time: new Date().toISOString(), step, state, error: String(error),
  })}\n`, { mode: 0o600 });
}
