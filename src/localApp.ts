import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { appendFile } from "node:fs/promises";
import { z } from "zod";
import { Resend } from "resend";
import { EmailClassificationSchema } from "./emailClassification.js";
import { createModel } from "./model.js";
import { createWorkflow, type Email } from "./passwordWorkflow.js";

const eventSchema = z.object({
  type: z.string(),
  data: z.object({ email_id: z.string().min(1) }).optional(),
});
const receivedSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  subject: z.string(),
  text: z.string().nullable(),
  html: z.string().nullable(),
});

export async function saveFailure(
  step: string,
  state: Partial<Email>,
  error: unknown,
) {
  // TODO: Define redaction, retention, rotation, and access controls before logging real customer content.
  await appendFile(
    "failures.jsonl",
    JSON.stringify({
      time: new Date().toISOString(),
      step,
      state,
      error: String(error),
    }) + "\n",
    { mode: 0o600 },
  );
}

export function createLocalApp(config: {
  resendKey: string;
  emailAddress: string;
  model: ReturnType<typeof createModel>;
}) {
  const resend = new Resend(config.resendKey);
  const model = config.model;
  const workflow = createWorkflow({
    knowledgePath: "password-knowledge.txt",
    fail: saveFailure,
    async classify(messages, runConfig) {
      return model
        .withStructuredOutput(EmailClassificationSchema)
        .invoke(messages, runConfig);
    },
    async generate(messages, runConfig) {
      const result = await model.invoke(messages, runConfig);
      if (typeof result.content !== "string" || !result.content.trim())
        throw new Error("Model returned an empty or non-text response");
      return result.content;
    },
    async send(email, response) {
      // TODO: Preserve reply-thread headers and record the provider message ID when the delivery contract is known.
      const result = await resend.emails.send({
        from: config.emailAddress,
        to: email.senderEmail,
        subject: `Re: ${email.subject}`,
        text: response,
      });
      if (result.error)
        throw new Error(`Resend send failed: ${result.error.message}`);
    },
  });

  // TODO: Verify webhook signatures before accepting events outside controlled local testing.
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST" || request.url !== "/webhook") {
      response.writeHead(404).end();
      return;
    }
    let emailId: string | undefined;
    let step = "webhook";
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1024 * 1024)
          throw new Error("Webhook body exceeds 1 MB");
      }
      const event = eventSchema.parse(JSON.parse(body));
      if (event.type !== "email.received") {
        response.writeHead(200).end();
        return;
      }
      emailId = z.string().min(1).parse(event.data?.email_id);
      step = "retrieve";
      const result = await resend.emails.receiving.get(emailId);
      if (result.error)
        throw new Error(`Resend retrieval failed: ${result.error.message}`);
      const email = receivedSchema.parse(result.data);
      // TODO: Convert HTML-only messages to safe plain text instead of feeding raw markup to the model.
      const content = email.text || email.html;
      if (!content?.trim()) throw new Error("Received email has no body");
      step = "workflow";
      // TODO: Deduplicate email IDs durably so webhook retries cannot generate duplicate replies.
      await workflow.invoke({
        emailId: email.id,
        senderEmail: email.from,
        subject: email.subject,
        emailContent: content,
      });
      response.writeHead(200).end();
    } catch (error) {
      if (step !== "workflow") {
        try {
          await saveFailure(step, emailId ? { emailId } : {}, error);
        } catch (loggingError) {
          console.error("Unable to save failure:", loggingError);
        }
      }
      console.error(`Email processing failed at ${step}:`, error);
      response.writeHead(500).end("Processing failed");
    }
  };
}

export function startServer() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const required = [
    "RESEND_API_KEY",
    "EMAIL_ADDRESS",
    "MODEL_BASE_URL",
    "MODEL_API_KEY",
    "MODEL_NAME",
  ] as const;
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length)
    throw new Error(`Missing configuration: ${missing.join(", ")}`);
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535");
  const handler = createLocalApp({
    resendKey: process.env.RESEND_API_KEY!,
    emailAddress: process.env.EMAIL_ADDRESS!,
    model: createModel({
      modelUrl: process.env.MODEL_BASE_URL!,
      modelKey: process.env.MODEL_API_KEY!,
      modelName: process.env.MODEL_NAME!,
    }),
  });
  createServer(handler).listen(port, "127.0.0.1", () =>
    console.log(`Listening on http://127.0.0.1:${port}/webhook`),
  );
}
