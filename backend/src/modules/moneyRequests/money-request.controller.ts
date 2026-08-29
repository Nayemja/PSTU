import type { RequestHandler } from "express";
import {
  approveMoneyRequest, createMoneyRequest, declineMoneyRequest, listMoneyRequests,
  MoneyRequestForbiddenError, MoneyRequestNotFoundError, MoneyRequestNotPendingError,
  PayerNotFoundError, SelfRequestError,
} from "./money-request.service";
import { createMoneyRequestSchema } from "./money-request.schema";

const fail = (response: Parameters<RequestHandler>[1], error: unknown) => {
  if (error instanceof PayerNotFoundError || error instanceof MoneyRequestNotFoundError)
    return response.status(404).json({ success: false, message: "Money request or payer not found" });
  if (error instanceof MoneyRequestForbiddenError)
    return response.status(403).json({ success: false, message: "Only the payer can update this request" });
  if (error instanceof SelfRequestError)
    return response.status(400).json({ success: false, message: "Cannot request money from yourself" });
  if (error instanceof MoneyRequestNotPendingError)
    return response.status(400).json({ success: false, message: "Money request is not pending" });
  return response.status(500).json({ success: false, message: "Internal server error" });
};

export const create: RequestHandler = async (request, response) => {
  const input = createMoneyRequestSchema.safeParse(request.body);
  if (!input.success) return void response.status(400).json({ success: false, message: "Invalid money request data" });
  try {
    const moneyRequest = await createMoneyRequest(request.userId!, input.data);
    response.status(201).json({ success: true, message: "Money request created", moneyRequest });
  } catch (error) { fail(response, error); }
};

export const list: RequestHandler = async (request, response) => {
  try { response.json({ success: true, ...(await listMoneyRequests(request.userId!)) }); }
  catch (error) { fail(response, error); }
};

export const approve: RequestHandler = async (request, response) => {
  const requestId = request.params.id;
  if (typeof requestId !== "string") return void response.status(400).json({ success: false, message: "Invalid money request" });
  try {
    const transactionId = await approveMoneyRequest(requestId, request.userId!);
    response.json({ success: true, message: "Money request approved", transactionId });
  } catch (error) { fail(response, error); }
};

export const decline: RequestHandler = async (request, response) => {
  const requestId = request.params.id;
  if (typeof requestId !== "string") return void response.status(400).json({ success: false, message: "Invalid money request" });
  try {
    await declineMoneyRequest(requestId, request.userId!);
    response.json({ success: true, message: "Money request declined" });
  } catch (error) { fail(response, error); }
};
