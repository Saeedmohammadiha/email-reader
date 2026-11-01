import { ChatOpenAI } from "@langchain/openai";

export const llm = new ChatOpenAI({
  model: "claude-sonnet-4-6",
  temperature: 0.7,
  configuration: {
    baseURL: "http://localhost:8000/v1",
    apiKey: "your-api-key",
  },
});