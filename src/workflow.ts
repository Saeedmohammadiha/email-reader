import { END, START, StateGraph, NodeTimeoutError, type NodeError } from "@langchain/langgraph";
import { isRetryableModelError } from "./model.js";
import { saveFailure } from "./failures.js";
import { classify, routeRequest, WorkflowContextSchema } from "./nodes/classify.js";
import { loadKnowledge, passwordResponse, missingKnowledge } from "./branches/password.js";
import { unrelatedResponse, human } from "./nodes/fallback.js";
import { send } from "./nodes/send.js";
import { EmailAgentState, type WorkflowState } from "./workflowState.js";

async function errorHandler(state: WorkflowState, { node, error }: NodeError): Promise<never> {
  try {
    await saveFailure(node, state, error);
  } catch (loggingError) {
    console.error("Unable to save workflow failure:", loggingError);
  }
  // shortcut: LangGraph 1.5.2 suppresses rethrowing the handled instance; wrap until upstream fixes it.
  throw new Error(`Workflow failed at ${node}: ${error.message}`, { cause: error });
}

const nodeOptions = { errorHandler };
const modelNodeOptions = {
  errorHandler,
  timeout: 300_000,
  retryPolicy: {
    maxAttempts: 3,
    retryOn: (error: unknown) => error instanceof NodeTimeoutError || isRetryableModelError(error),
  },
};

export const workflow = new StateGraph(EmailAgentState, WorkflowContextSchema)
  .addNode("classify", classify, modelNodeOptions)
  .addNode("loadKnowledge", loadKnowledge, nodeOptions)
  .addNode("passwordResponse", passwordResponse, modelNodeOptions)
  .addNode("missingKnowledge", missingKnowledge, modelNodeOptions)
  .addNode("unrelatedResponse", unrelatedResponse, modelNodeOptions)
  .addNode("human", human, nodeOptions)
  .addNode("send", send, nodeOptions)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", routeRequest, ["loadKnowledge", "unrelatedResponse", "human"])
  .addConditionalEdges("loadKnowledge", (state) => state.knowledge ? "passwordResponse" : "missingKnowledge", ["passwordResponse", "missingKnowledge"])
  .addEdge("passwordResponse", "send")
  .addEdge("missingKnowledge", "send")
  .addEdge("unrelatedResponse", "send")
  .addEdge("human", END)
  .addEdge("send", END)
  .compile();
