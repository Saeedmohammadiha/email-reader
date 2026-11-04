import { z } from "zod";

export const IncomingRequestSchema = z.object({
  id: z.string().min(1),
  sender: z.string().min(1),
  subject: z.string(),
  content: z.string().refine((value) => value.trim().length > 0, "Received request has no body"),
});

export type IncomingRequest = z.infer<typeof IncomingRequestSchema>;

export interface ChannelAdapter {
  receive(event: unknown): Promise<IncomingRequest | undefined>;
  sendReply(request: IncomingRequest, response: string): Promise<void>;
}
