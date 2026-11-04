import { startServer } from "./server.js";

// TODO: Shut down in-flight work gracefully.
await startServer();
