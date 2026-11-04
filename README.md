# Local ISP password-guidance assistant

A local LangGraph application receives Resend inbound-email events and replies to requests for ISP account password guidance. It uses a local knowledge file; it does not build a RAG index.

`pnpm start` only starts the webhook listener. Send an email manually to the Resend receiving address to trigger retrieval, LLM classification, and routing. Startup does not generate or send a sample email; mock messages are confined to automated tests.

## Setup

1. Use Node.js 22 or newer and install the dependencies with `pnpm install`.
2. Use `.env.example` as a guide to add `RESEND_API_KEY`, `EMAIL_ADDRESS`, `MODEL_BASE_URL`, `MODEL_API_KEY`, and `MODEL_NAME` to your existing `.env`. The model endpoint must support the OpenAI-compatible structured-output API. `EMAIL_ADDRESS` must be a sender authorized by Resend. `PORT` is optional and defaults to 3000. Never commit `.env`.
3. Review the password templates and prompts in `src/branches/password.ts` and the unrelated-response template and prompt in `src/nodes/fallback.ts` before sending.
4. Put the ISP account password instructions in `password-knowledge.txt` at the project root. This local file is ignored by Git. An absent or empty file selects the missing-knowledge template.
5. Start with `pnpm start`. Expose port 3000 using ngrok, then configure a Resend webhook for `email.received` with the public URL ending in `/webhook`. Set up your Resend receiving address and send test emails to it. The endpoint must be able to retrieve the message using the configured Resend API key.

## Manual checks

- Send an email asking only for ISP account password-change guidance. The reply should follow the password template and local knowledge.
- Temporarily move or empty the knowledge file and repeat. The reply should follow the missing-knowledge template.
- Send an unrelated email. It should use the unrelated template.
- Send a mixed or ambiguous email. When classified as `complex`, the application logs the email ID for human handling and sends no reply. Critical requests also take this path.
- Temporarily use an invalid model configuration, send an email, and inspect `failures.jsonl` for its state and the failed step. Restore the configuration afterwards.

Run `pnpm lint`, `pnpm test`, and `pnpm typecheck` for automated checks. Biome lints the application and tests using its recommended rules; `pnpm lint:fix` applies safe fixes. `failures.jsonl` is ignored by Git and may contain full email content. Keep test messages fictional and protect the file.

## Code structure

The application has one compiled workflow, exported from `src/workflow.ts`. The password flow is a branch of that graph. Node functions are imported directly; there is no workflow factory or injected bundle of node functions.

```text
src/
  adapters/
    types.ts           Shared incoming request and channel-adapter interface
    resend.ts          Resend event validation, retrieval, normalization, sending
  branches/password.ts Password knowledge and response nodes, with their templates
  nodes/
    classify.ts        First node and classification routing
    draftResponse.ts   Shared model invocation for response nodes
    fallback.ts        Unrelated-response and human-handling nodes
    send.ts            Sends through the adapter supplied for the current run
  workflow.ts          The single graph: nodes, edges, retries, timeouts
  emailClassification.ts Shared graph state and classification schemas
  model.ts             One model client, reused by all requests
  config.ts            Loads .env and validates required settings and PORT
  failures.ts          Local failure recording
  api.ts               Fastify API: POST /webhook -> adapter.receive -> workflow.invoke
  server.ts            Creates the adapter and starts the HTTP listener
  index.ts             Starts the listener
```

The adapter returns a validated `{ id, sender, subject, content }` request. The listener starts the graph at `START`, which enters the classification node:

```ts
const request = await adapter.receive(event);
if (request) {
  await workflow.invoke({ request }, { context: { adapter } });
}
```

The adapter belongs to LangGraph runtime context, not persisted state. The `send` node calls that run's adapter, so adding a ticket adapter does not require putting ticket-provider code in the graph. Only the Resend adapter is implemented currently; ticket payloads and integration details remain open.

Fastify parses JSON and enforces a 1 MiB request-body limit. Malformed JSON receives HTTP 400 and oversized payloads HTTP 413 before reaching the adapter. API tests use Fastify's built-in request injection without opening a listening port.

`config.ts` loads and validates environment settings before the model or server initializes. The test command preloads fictional settings from `tests/setup.ts` before importing application modules.

Nodes build their own prompts from raw state. Native node error handlers record the failed node and its input state before failing the run, preserving the original exception as the cause. Workflow logs contain the normalized input under `state.request`; intake failures record the available source event.

Classification includes a validated `flow` value (`password_guidance` or `unrelated`); free-text `topic` describes the issue and does not control routing. Only `general_question` with flow `password_guidance` enters the password flow. Complex or critical requests keep the human-handling fallback.

LangGraph model nodes use at most 3 total attempts, each limited to 300 seconds. Only transient provider errors and node timeouts are retried; authentication, quota, and validation failures stop immediately. Client-level model retries are disabled. Sending email is not retried by the graph.

The webhook does not verify signatures, and duplicate event deliveries can generate duplicate replies. Use only a controlled local test setup. Configure signature verification, deduplication, and an actual human-review process before exposing this service for real use.
