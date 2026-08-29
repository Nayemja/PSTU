import { z } from "zod";

export const createMoneyRequestSchema = z.object({
  payerEmail: z.string().trim().email().transform((email) => email.toLowerCase()),
  amountPoysha: z.number().int().positive(),
  note: z.string().max(200).optional(),
});

export type CreateMoneyRequestInput = z.infer<typeof createMoneyRequestSchema>;
