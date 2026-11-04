import {
  ChatOpenAI,
  type ChatOpenAICallOptions,
  OpenAIClient,
} from "@langchain/openai";
import { getRetryable } from "@langchain/core/errors";
import { config } from "./infra/config.js";

const model = new ChatOpenAI({
  model: config.MODEL_NAME,
  apiKey: config.MODEL_API_KEY,
  configuration: { baseURL: config.MODEL_BASE_URL },
  temperature: 0,
  maxRetries: 0,
});

export function getModel(): ChatOpenAI<ChatOpenAICallOptions> {
  return model;
}

export function isRetryableModelError(error: unknown): boolean {
  if (
    error instanceof OpenAIClient.APIError &&
    error.code === "insufficient_quota"
  )
    return false;
  const retryable = getRetryable(error);
  if (retryable !== undefined) return retryable;
  if (error instanceof OpenAIClient.APIConnectionError) return true;
  return (
    error instanceof OpenAIClient.APIError &&
    error.status !== undefined &&
    (error.status === 408 ||
      error.status === 429 ||
      (error.status >= 500 && error.status < 600))
  );
}
