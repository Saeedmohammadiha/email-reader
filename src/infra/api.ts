import Fastify from "fastify";
import type { ChannelAdapter } from "../adapters/types.js";
import { saveFailure } from "../failures.js";
import { workflow } from "../workflow.js";

export function createApi(adapter: ChannelAdapter) {
  const app = Fastify({ bodyLimit: 1024 * 1024 });

  app.post("/webhook", async (request, reply) => {
    let step = "receive";
    try {
      const incoming = await adapter.receive(request.body);
      if (!incoming) {
        return reply.code(200).send();
      }
      step = "workflow";
      // TODO: Deduplicate source requests durably so webhook retries cannot generate duplicate replies.
      await workflow.invoke({ request: incoming }, { context: { adapter } });
      return reply.code(200).send();
    } catch (error) {
      if (step !== "workflow") {
        try {
          await saveFailure(step, { event: request.body }, error);
        } catch (loggingError) {
          console.error("Unable to save failure:", loggingError);
        }
      }
      console.error(`Request processing failed at ${step}:`, error);
      return reply.code(500).send("Processing failed");
    }
  });

  return app;
}
