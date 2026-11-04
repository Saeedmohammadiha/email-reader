import { z } from "zod";

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const configSchema = z.object({
  RESEND_API_KEY: z.string().trim().min(1),
  EMAIL_ADDRESS: z.string().trim().min(1),
  MODEL_BASE_URL: z.string().trim().min(1),
  MODEL_API_KEY: z.string().trim().min(1),
  MODEL_NAME: z.string().trim().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

export const config = readConfig();
