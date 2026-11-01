import { Command, END, GraphNode, interrupt } from "@langchain/langgraph";
import { EmailAgentState } from "./emailClassification.js";
import { HumanMessage } from "@langchain/core/messages";
import { llm } from "./model.js";

export const draftResponse: GraphNode<typeof EmailAgentState> = async (state, config) => {
  // Generate response using context and route based on quality

  const classification = state.classification!;

  // Format context from raw state data on-demand
  const contextSections: string[] = [];

  if (state.searchResults) {
    // Format search results for the prompt
    const formattedDocs = state.searchResults.map(doc => `- ${doc}`).join("\n");
    contextSections.push(`Relevant documentation:\n${formattedDocs}`);
  }

  if (state.customerHistory) {
    // Format customer data for the prompt
    contextSections.push(`Customer tier: ${state.customerHistory.tier ?? "standard"}`);
  }

  // Build the prompt with formatted context
  const draftPrompt = `
  Draft a response to this customer email:
  ${state.emailContent}

  Email intent: ${classification.intent}
  Urgency level: ${classification.urgency}

  ${contextSections.join("\n\n")}

  Guidelines:
  - Be professional and helpful
  - Address their specific concern
  - Use the provided documentation when relevant
  `;

  const response = await llm.invoke([new HumanMessage(draftPrompt)]);

  // Determine if human review needed based on urgency and intent
  const needsReview = (
    classification.urgency === "high" ||
    classification.urgency === "critical" ||
    classification.intent === "complex"
  );

  // Route to appropriate next node
  const nextNode = needsReview ? "humanReview" : "sendReply";

  return new Command({
    update: { responseText: response.content.toString() },  // Store only the raw response
    goto: nextNode,
  });
}

export const humanReview: GraphNode<typeof EmailAgentState> = async (state, config) => {
  // Pause for human review using interrupt and route based on decision
  const classification = state.classification!;

  // interrupt() must come first - any code before it will re-run on resume
  const humanDecision = interrupt({
    emailId: state.emailId,
    originalEmail: state.emailContent,
    draftResponse: state.responseText,
    urgency: classification.urgency,
    intent: classification.intent,
    action: "Please review and approve/edit this response",
  });

  // Now process the human's decision
  if (humanDecision.approved) {
    return new Command({
      update: { responseText: humanDecision.editedResponse || state.responseText },
      goto: "sendReply",
    });
  } else {
    // Rejection means human will handle directly
    return new Command({ update: {}, goto: END });
  }
}

export const sendReply: GraphNode<typeof EmailAgentState> = async (state, config) => {
  // Send the email response
  // Integrate with email service
  console.log(`Sending reply: ${state.responseText!.substring(0, 100)}...`);
  return {};
}