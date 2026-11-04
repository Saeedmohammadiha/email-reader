import { ResendAdapter } from "./adapters/resend.js";
import { createApi } from "./api.js";
import { config } from "./config.js";

export async function startServer() {
  const adapter = new ResendAdapter(config.RESEND_API_KEY, config.EMAIL_ADDRESS);
  const app = createApi(adapter);
  const address = await app.listen({ port: config.PORT, host: "127.0.0.1" });
  console.log(`Listening on ${address}/webhook`);
  return app;
}
