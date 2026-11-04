import { readFile } from "node:fs/promises";
import type { GraphNode } from "@langchain/langgraph";
import type { EmailAgentState } from "../emailClassification.js";
import { draftResponse } from "../nodes/draftResponse.js";

export const PASSWORD_TEMPLATE = `
کاربر عزیز شاتل سلام

برای تغییر رمز عبور شما میتوانید {{the model result of searching the rag should go here}}

من هوش مصتوعی شاتل هستم و اگر به کمک من احتیاج داشتید من میتونم کمکتون کنم`;
export const MISSING_KNOWLEDGE_TEMPLATE = `
کاربر عزیز شاتل سلام

من در این مورد اطلاعاتی یافت نکردم
من هوش مصتوعی شاتل هستم و اگر به کمک من احتیاج داشتید من میتونم کمکتون کنم
اگر فکر میکنید که این ایمیل به اشتباه پاسخ داده شده است لطفا مجدد سوال خود را روی همین ایمیل ارسال کنید.
`;

export const loadKnowledge: GraphNode<typeof EmailAgentState> = async () => {
  try {
    return { knowledge: (await readFile("password-knowledge.txt", "utf8")).trim() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { knowledge: "" };
    throw error;
  }
};

export const passwordResponse: GraphNode<typeof EmailAgentState> = async (state, config) => {
  const systemPrompt = "Write concise Persian ISP password guidance. Follow the template and use only the supplied knowledge for factual instructions; never invent steps.";
  return draftResponse(state, PASSWORD_TEMPLATE, systemPrompt, config);
};

export const missingKnowledge: GraphNode<typeof EmailAgentState> = async (state, config) => {
  const systemPrompt = "Write a concise Persian response explaining that reliable password guidance is unavailable. Follow the template and do not invent instructions.";
  return draftResponse(state, MISSING_KNOWLEDGE_TEMPLATE, systemPrompt, config);
};
