import type { RequestHandler } from "express";

import { getTransactionHistory } from "./transaction.service";

export const history: RequestHandler = async (request, response) => {
  try {
    const transactions = await getTransactionHistory(request.userId!);
    response.json({ success: true, transactions });
  } catch {
    response.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
