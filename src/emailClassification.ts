import { StateSchema } from "@langchain/langgraph";
import * as z from "zod";

export const EmailClassificationSchema = z.object({
  intent: z.enum(["general_question", "technical_problem", "billing", "wants_buy", "complex"]),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  flow: z.enum(["password_guidance", "unrelated"]),
  topic: z.string(),
  summary: z.string(),
});

export const EmailAgentState = new StateSchema({
  // Raw email data
  emailContent: z.string(),
  senderEmail: z.string(),
  subject: z.string(),
  emailId: z.string(),

  // Classification result
  classification: EmailClassificationSchema.optional(),

  // Raw search/API results
  knowledge: z.string().optional(),
  searchResults: z.array(z.string()).optional(),  // List of raw document chunks
  customerHistory: z.record(z.string(), z.any()).optional(),  // Raw customer data from CRM

  // Generated content
  responseText: z.string().optional(),
});

export type EmailClassificationType = z.infer<typeof EmailClassificationSchema>;
