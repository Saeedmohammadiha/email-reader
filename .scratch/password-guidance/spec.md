# Local password-guidance milestone

## Goal

Receive a Resend inbound email on a local webhook, classify it with the configured LLM, and automatically send a templated response for ISP account password guidance. This milestone establishes the workflow structure with one issue flow.

## Behavior

- Password guidance requests use the local password knowledge file and the password response template.
- Missing or empty knowledge uses the missing-knowledge response template.
- Unrelated or mixed requests use the unrelated response template.
- Uncertain classification logs the email ID for human handling and sends no response; there is no review queue.
- Each response node owns its template string. The LLM fills it using the shared system prompt, which specifies language.
- Resend delivers webhook events and sends responses. The user configures ngrok, credentials, templates, prompt, and knowledge.
- Failures are recorded locally with the workflow state. Duplicate events are not deduplicated, and the local webhook does not verify signatures.

## Out of scope

Actual password changes, RAG indexing, live company integrations, durable human review, and production deployment.

## Verification

Automated checks cover routing, template selection, sending, and failure state. The user manually checks the end-to-end Resend/ngrok round trip after supplying configuration and content.
