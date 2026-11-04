import type { GraphNode } from "@langchain/langgraph";
import type { EmailAgentState } from "../workflowState.js";
import type { WorkflowContext } from "./classify.js";

export const send: GraphNode<typeof EmailAgentState, WorkflowContext> = async (state, config) => {
  if (!state.responseText?.trim()) throw new Error("Generated response is empty");
  if (!config.context?.adapter) throw new Error("A channel adapter is required to send a reply");
  await config.context.adapter.sendReply(state.request, state.responseText);
  return {};
};
