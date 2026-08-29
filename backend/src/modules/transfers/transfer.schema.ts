import { z } from "zod";

export const transferSchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  amountPoysha: z.number().int().positive(),
  note: z.string().max(200).optional(),
  idempotencyKey: z.string().uuid(),
});

export type TransferInput = z.infer<typeof transferSchema>;
