import { ChatOpenAI, OpenAIClient } from "@langchain/openai";
import { getRetryable } from "@langchain/core/errors";

export function createModel(config: {
  modelName: string;
  modelKey: string;
  modelUrl: string;
}) {
  return new ChatOpenAI({
    model: config.modelName,
    apiKey: config.modelKey,
    configuration: { baseURL: config.modelUrl },
    temperature: 0,
    maxRetries: 0,
  });
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
