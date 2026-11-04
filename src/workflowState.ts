import { StateSchema } from "@langchain/langgraph";
import { IncomingRequestSchema } from "./adapters/types.js";
import { EmailClassificationSchema } from "./nodes/classify.js";
import * as z from "zod";

export const EmailAgentState = new StateSchema({
  request: IncomingRequestSchema,

  // Classification result
  classification: EmailClassificationSchema.optional(),

  knowledge: z.string().optional(),

  // Generated content
  responseText: z.string().optional(),
});

export type WorkflowState = typeof EmailAgentState.State;
