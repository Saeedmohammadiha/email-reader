import type { GraphNode } from "@langchain/langgraph";
import type { EmailAgentState } from "../emailClassification.js";
import { draftResponse } from "./draftResponse.js";

export const UNRELATED_TEMPLATE = `
کاربر عزیز شاتل سلام

سوال شما در حوزه مشکلات کاربران شاتل نیست
من هوش مصتوعی شاتل هستم و اگر به کمک من احتیاج داشتید من میتونم کمکتون کنم
اگر فکر میکنید که این ایمیل به اشتباه پاسخ داده شده است لطفا مجدد سوال خود را روی همین ایمیل ارسال کنید.
`;

export const unrelatedResponse: GraphNode<typeof EmailAgentState> = async (state, config) => {
  const systemPrompt = "Write a concise Persian response explaining that the request is outside this password-guidance flow. Follow the template and do not answer the unrelated request.";
  return draftResponse(state, UNRELATED_TEMPLATE, systemPrompt, config);
};

export const human: GraphNode<typeof EmailAgentState> = async (state) => {
  // TODO: Replace console-only handoff with the ticket platform's durable human-review path.
  console.log(`Human review needed for request ${state.request.id}`);
  return {};
};
