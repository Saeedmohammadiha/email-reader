import { StateSchema } from "@langchain/langgraph";
import * as z from "zod";
import { IncomingRequestSchema, type ChannelAdapter } from "./adapters/types.js";

export const EmailClassificationSchema = z.object({
  intent: z.enum(["general_question", "technical_problem", "billing", "wants_buy", "complex"]),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  flow: z.enum(["password_guidance", "unrelated"]),
  topic: z.string(),
  summary: z.string(),
});

export const EmailAgentState = new StateSchema({
  request: IncomingRequestSchema,

  // Classification result
  classification: EmailClassificationSchema.optional(),

  knowledge: z.string().optional(),

  // Generated content
  responseText: z.string().optional(),
});

export type EmailClassificationType = z.infer<typeof EmailClassificationSchema>;
export type WorkflowState = typeof EmailAgentState.State;

export const WorkflowContextSchema = z.object({
  adapter: z.custom<ChannelAdapter>((value) =>
    typeof value === "object" && value !== null && "sendReply" in value &&
    typeof value.sendReply === "function", "A channel adapter is required"),
});
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
