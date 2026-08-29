import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
});

export const env = environmentSchema.parse(process.env);
