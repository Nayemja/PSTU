import type { RequestHandler } from "express";

import {
  executeTransfer,
  IdempotencyConflictError,
  InsufficientFundsError,
  RecipientNotFoundError,
  SelfTransferError,
} from "./transfer.service";
import { transferSchema } from "./transfer.schema";

export const createTransfer: RequestHandler = async (request, response) => {
  const parsedInput = transferSchema.safeParse(request.body);

  if (!parsedInput.success) {
    response.status(400).json({
      success: false,
      message: "Invalid transfer data",
    });
    return;
  }

  try {
    const result = await executeTransfer(request.userId!, parsedInput.data);

    response.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      message: "Transfer completed successfully",
      ...result,
    });
  } catch (error) {
    if (error instanceof RecipientNotFoundError) {
      response.status(404).json({ success: false, message: "Recipient not found" });
      return;
    }

    if (error instanceof SelfTransferError) {
      response.status(400).json({
        success: false,
        message: "Cannot transfer money to yourself",
      });
      return;
    }

    if (error instanceof InsufficientFundsError) {
      response.status(400).json({ success: false, message: "Insufficient balance" });
      return;
    }

    if (error instanceof IdempotencyConflictError) {
      response.status(409).json({
        success: false,
        message: "Idempotency key was already used for a different transfer",
      });
      return;
    }

    response.status(500).json({ success: false, message: "Internal server error" });
  }
};
