import { Command, GraphNode } from "@langchain/langgraph";
import { EmailAgentState } from "../emailClassification.js";

export const sendReply: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  try {
    // await emailService.send(state.responseText);
    await Promise.resolve();
    return {}
  } catch (error) {
    throw error; // Surface unexpected errors
  }
};
