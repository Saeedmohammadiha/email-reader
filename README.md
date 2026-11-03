# Local ISP password-guidance assistant

A local LangGraph application receives Resend inbound-email events and replies to requests for ISP account password guidance. It uses a local knowledge file; it does not build a RAG index.

## Setup

1. Use Node.js 22 or newer and install the dependencies with `pnpm install`.
2. Use `.env.example` as a guide to add `RESEND_API_KEY`, `EMAIL_ADDRESS`, `MODEL_BASE_URL`, `MODEL_API_KEY`, `MODEL_NAME`, and `SYSTEM_PROMPT` to your existing `.env`. The model endpoint must support the OpenAI-compatible structured-output API. `EMAIL_ADDRESS` must be a sender authorized by Resend. `PORT` is optional and defaults to 3000. Never commit `.env`.
3. Replace all three `TODO` response-template strings in `src/passwordWorkflow.ts`. The shared system prompt also determines the response language. The application refuses to send while the selected template is still a `TODO`.
4. Put the ISP account password instructions in `password-knowledge.txt` at the project root. This local file is ignored by Git. An absent or empty file selects the missing-knowledge template.
5. Start with `pnpm start`. Expose port 3000 using ngrok, then configure a Resend webhook for `email.received` with the public URL ending in `/webhook`. Set up your Resend receiving address and send test emails to it. The endpoint must be able to retrieve the message using the configured Resend API key.

## Manual checks

- Send an email asking only for ISP account password-change guidance. The reply should follow the password template and local knowledge.
- Temporarily move or empty the knowledge file and repeat. The reply should follow the missing-knowledge template.
- Send an unrelated email, then a mixed password-and-other-issue email. Each should use the unrelated template.
- Send an ambiguous email. When classified as uncertain, the application logs the email ID for human handling and sends no reply.
- Temporarily use an invalid model configuration, send an email, and inspect `failures.jsonl` for its state and the failed step. Restore the configuration afterwards.

Run `pnpm test` and `pnpm typecheck` for automated checks. `failures.jsonl` is ignored by Git and may contain full email content. Keep test messages fictional and protect the file.

The webhook does not verify signatures, and duplicate event deliveries can generate duplicate replies. Use only a controlled local test setup. Configure signature verification, deduplication, and an actual human-review process before exposing this service for real use.
