import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "../src/infra/config.js";

const env = {
  RESEND_API_KEY: "test",
  EMAIL_ADDRESS: "test@example.test",
  MODEL_NAME: "test",
  MODEL_API_KEY: "test",
  MODEL_BASE_URL: "http://model.example.test/v1",
};

test("configuration requires every setting and rejects blank values", () => {
  for (const key of Object.keys(env)) {
    for (const value of [undefined, "", "  "]) {
      assert.throws(() => readConfig({ ...env, [key]: value }), (error) =>
        error instanceof Error && error.message.includes(key));
    }
  }
});

test("configuration defaults the port and validates its range", () => {
  assert.deepEqual(readConfig(env), { ...env, PORT: 3000 });
  assert.equal(readConfig({ ...env, PORT: "8080" }).PORT, 8080);
  for (const port of ["", "0", "-1", "65536", "3.5", "invalid"]) {
    assert.throws(() => readConfig({ ...env, PORT: port }), /PORT/);
  }
  for (const port of ["1", "65535"]) {
    assert.equal(readConfig({ ...env, PORT: port }).PORT, Number(port));
  }
});
