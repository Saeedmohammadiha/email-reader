import { GraphNode, Command } from "@langchain/langgraph";
import {
  EmailAgentState,
  EmailClassificationSchema,
} from "./emailClassification.js";
import { llm } from "./model.js";


import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// resend.emails.send({
//   from: 'onboarding@resend.dev',
//   to: 'saeed1440124@gmail.com',
//   subject: 'Hello World',
//   html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
// });

resend.emails.receiving

export const readEmail: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  // Extract and parse email content
  // In production, this would connect to your email service
  console.log(`Processing email: ${state.emailContent}`);
  return {};
};

export const classifyIntent: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  // Use LLM to classify email intent and urgency, then route accordingly

  // Create structured LLM that returns EmailClassification object
  const structuredLlm = llm.withStructuredOutput(EmailClassificationSchema);

  // Format the prompt on-demand, not stored in state
  const classificationPrompt = `
  Analyze this customer email and classify it:

  Email: ${state.emailContent}
  From: ${state.senderEmail}

  Provide classification including intent, urgency, topic, and summary.
  `;

  // Get structured response directly as object
  const classification = await structuredLlm.invoke(classificationPrompt);

  // Determine next node based on classification
  let nextNode:
    | "searchDocumentation"
    | "humanReview"
    | "draftResponse"
    | "bugTracking";

  if (
    classification.intent === "billing" ||
    classification.urgency === "critical"
  ) {
    nextNode = "humanReview";
  } else if (
    classification.intent === "question" ||
    classification.intent === "feature"
  ) {
    nextNode = "searchDocumentation";
  } else if (classification.intent === "bug") {
    nextNode = "bugTracking";
  } else {
    nextNode = "draftResponse";
  }

  // Store classification as a single object in state
  return new Command({
    update: { classification },
    goto: nextNode,
  });
};
