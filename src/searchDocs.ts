import { Command, GraphNode } from "@langchain/langgraph";
import { EmailAgentState } from "./emailClassification.js";

export const searchDocumentation: GraphNode<typeof EmailAgentState> = async (state, config) => {
  // Search knowledge base for relevant information

  // Build search query from classification
  const classification = state.classification!;
  const query = `${classification.intent} ${classification.topic}`;

  let searchResults: string[];

  try {
    // Implement your search logic here
    // Store raw search results, not formatted text
    searchResults = [
      "Reset password via Settings > Security > Change Password",
      "Password must be at least 12 characters",
      "Include uppercase, lowercase, numbers, and symbols",
    ];
  } catch (error) {
    // For recoverable search errors, store error and continue
    searchResults = [`Search temporarily unavailable: ${error}`];
  }

  return new Command({
    update: { searchResults },  // Store raw results or error
    goto: "draftResponse",
  });
}

