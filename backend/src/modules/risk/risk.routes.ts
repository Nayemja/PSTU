import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { previewTransfer } from "./risk.service";

const schema = z.object({
  recipientEmail: z.string().trim().email().transform((email) => email.toLowerCase()),
  amountPoysha: z.number().int().positive(),
});

export const riskRouter = Router();
riskRouter.post("/transfer-preview", requireAuth, async (request, response) => {
  const input = schema.safeParse(request.body);
  if (!input.success) return void response.status(400).json({ success: false, message: "Invalid preview data" });
  try {
    const preview = await previewTransfer(request.userId!, input.data.recipientEmail, input.data.amountPoysha);
    if (!preview) return void response.status(404).json({ success: false, message: "Recipient not found" });
    response.json({ success: true, ...preview });
  } catch { response.status(500).json({ success: false, message: "Internal server error" }); }
});
