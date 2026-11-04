import { startServer } from "./infra/server.js";

// TODO: Shut down in-flight work gracefully.
await startServer();
