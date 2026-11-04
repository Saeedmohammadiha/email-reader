import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { WorkflowState } from "../workflowState.js";
import { getModel } from "../model.js";

export async function draftResponse(
  state: WorkflowState,
  template: string,
  systemPrompt: string,
  config: RunnableConfig,
) {
  const result = await getModel().invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Fill the response template. Use only the supplied knowledge for factual instructions; do not invent details.\nTemplate:\n${template}\nKnowledge:\n${state.knowledge ?? ""}\nCustomer request:\n${state.request.content}`),
  ], config);
  if (typeof result.content !== "string" || !result.content.trim()) {
    throw new Error("Model returned an empty or non-text response");
  }
  return { responseText: result.content };
}
