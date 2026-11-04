import { Resend } from "resend";
import { z } from "zod";
import { IncomingRequestSchema, type ChannelAdapter, type IncomingRequest } from "./types.js";

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

export class ResendAdapter implements ChannelAdapter {
  private readonly client: Resend;

  constructor(apiKey: string, private readonly from: string) {
    this.client = new Resend(apiKey);
  }

  async receive(payload: unknown): Promise<IncomingRequest | undefined> {
    const event = eventSchema.parse(payload);
    if (event.type !== "email.received") return undefined;
    const emailId = z.string().min(1).parse(event.data?.email_id);
    const result = await this.client.emails.receiving.get(emailId);
    if (result.error) throw new Error(`Resend retrieval failed: ${result.error.message}`);
    const email = receivedSchema.parse(result.data);
    // TODO: Convert HTML-only messages to safe plain text before passing them to the workflow.
    return IncomingRequestSchema.parse({
      id: email.id,
      sender: email.from,
      subject: email.subject,
      content: email.text || email.html || "",
    });
  }

  async sendReply(request: IncomingRequest, response: string): Promise<void> {
    // TODO: Preserve reply-thread headers and record the provider message ID.
    const result = await this.client.emails.send({
      from: this.from,
      to: request.sender,
      subject: `Re: ${request.subject}`,
      text: response,
    });
    if (result.error) throw new Error(`Resend send failed: ${result.error.message}`);
  }
}
