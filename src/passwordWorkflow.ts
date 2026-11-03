import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { readFile } from "node:fs/promises";

export const classificationSchema = z.object({
  route: z.enum(["password", "unrelated", "uncertain"]),
});

export const EmailState = Annotation.Root({
  emailId: Annotation<string>,
  sender: Annotation<string>,
  subject: Annotation<string>,
  content: Annotation<string>,
  classification: Annotation<z.infer<typeof classificationSchema> | undefined>,
  knowledge: Annotation<string | undefined>,
  response: Annotation<string | undefined>,
});
export type Email = typeof EmailState.State;

type Services = {
  classify(email: Email): Promise<z.infer<typeof classificationSchema>>;
  generate(template: string, email: Email, knowledge?: string): Promise<string>;
  send(email: Email, response: string): Promise<void>;
  fail(step: string, state: Partial<Email>, error: unknown): Promise<void>;
  knowledgePath: string;
};

// TODO: Replace these strings with the approved response templates before sending.
export const PASSWORD_TEMPLATE = "TODO: add password guidance response template";
export const MISSING_KNOWLEDGE_TEMPLATE = "TODO: add missing knowledge response template";
export const UNRELATED_TEMPLATE = "TODO: add unrelated email response template";

export function createWorkflow(services: Services) {
  const guarded = <T extends object>(step: string, fn: (state: Email) => Promise<T>) =>
    async (state: Email): Promise<T> => {
      try {
        return await fn(state);
      } catch (error) {
        await services.fail(step, state, error);
        throw error;
      }
    };
  const generate = (template: string) => guarded("generate", async (state) => ({
    response: await services.generate(template, state, state.knowledge),
  }));

  return new StateGraph(EmailState)
    .addNode("classify", guarded("classify", async (state) => ({
      classification: classificationSchema.parse(await services.classify(state)),
    })))
    .addNode("password", guarded("knowledge", async () => {
      try {
        return { knowledge: (await readFile(services.knowledgePath, "utf8")).trim() };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { knowledge: "" };
        throw error;
      }
    }))
    .addNode("passwordResponse", generate(PASSWORD_TEMPLATE))
    .addNode("missingKnowledge", generate(MISSING_KNOWLEDGE_TEMPLATE))
    .addNode("unrelatedResponse", generate(UNRELATED_TEMPLATE))
    .addNode("human", async (state) => { console.log(`Human review needed for email ${state.emailId}`); return {}; })
    .addNode("send", guarded("send", async (state) => {
      if (!state.response?.trim()) throw new Error("Generated response is empty");
      await services.send(state, state.response);
      return {};
    }))
    .addEdge(START, "classify")
    .addConditionalEdges("classify", (state) => state.classification!.route, {
      password: "password", unrelated: "unrelatedResponse", uncertain: "human",
    })
    .addConditionalEdges("password", (state) => state.knowledge ? "passwordResponse" : "missingKnowledge")
    .addEdge("passwordResponse", "send")
    .addEdge("missingKnowledge", "send")
    .addEdge("unrelatedResponse", "send")
    .addEdge("human", END)
    .addEdge("send", END)
    .compile();
}
