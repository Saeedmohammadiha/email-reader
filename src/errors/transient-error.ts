import type { RetryPolicy } from "@langchain/langgraph";
import { workflow } from "../index.js";
import { searchDocumentation } from "../searchDocs.js";

workflow.addNode(
  "searchDocumentation",
  searchDocumentation,
  {
    retryPolicy: { maxAttempts: 3, initialInterval: 1.0 },
  },
);