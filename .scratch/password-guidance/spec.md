# Local password-guidance milestone

## Goal

Receive a Resend inbound email on a local webhook, classify it with the configured LLM, and automatically send a templated response for ISP account password guidance. This milestone establishes the workflow structure with one issue flow.

## Behavior

- Password guidance requests use the local password knowledge file and the password response template.
- Missing or empty knowledge uses the missing-knowledge response template.
- Unrelated or mixed requests use the unrelated response template.
- Uncertain classification logs the email ID for human handling and sends no response; there is no review queue.
- Each model node owns the system prompt for its task. Each response node also owns its template string and response language.
- Resend delivers webhook events and sends responses. The user configures ngrok, credentials, templates, and knowledge.
- Failures are recorded locally with the workflow state. Duplicate events are not deduplicated, and the local webhook does not verify signatures.

## Out of scope

Actual password changes, RAG indexing, live company integrations, durable human review, and production deployment.

## Verification

Automated checks cover routing, template selection, node-specific prompts, sending, and failure state. The user manually checks the end-to-end Resend/ngrok round trip after supplying configuration and content.
