import { pool } from "../../db/pool";
import { executeTransfer } from "../transfers/transfer.service";
import type { CreateMoneyRequestInput } from "./money-request.schema";

export class PayerNotFoundError extends Error {}
export class SelfRequestError extends Error {}
export class MoneyRequestNotFoundError extends Error {}
export class MoneyRequestForbiddenError extends Error {}
export class MoneyRequestNotPendingError extends Error {}

export async function createMoneyRequest(userId: string, input: CreateMoneyRequestInput) {
  const payer = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [input.payerEmail]);
  if (!payer.rows[0]) throw new PayerNotFoundError();
  if (payer.rows[0].id === userId) throw new SelfRequestError();

  const result = await pool.query<{ id: string; status: string; created_at: Date }>(
    `INSERT INTO money_requests (requester_id, payer_id, amount, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, status, created_at`,
    [userId, payer.rows[0].id, input.amountPoysha, input.note ?? null],
  );
  return result.rows[0];
}

export async function listMoneyRequests(userId: string) {
  const result = await pool.query<{
    id: string; requester_id: string; payer_id: string; amount: string; note: string | null;
    status: string; created_at: Date; requester_name: string; requester_email: string;
    payer_name: string; payer_email: string;
  }>(
    `SELECT mr.id, mr.requester_id, mr.payer_id, mr.amount, mr.note, mr.status, mr.created_at,
            requester.name AS requester_name, requester.email AS requester_email,
            payer.name AS payer_name, payer.email AS payer_email
     FROM money_requests mr
     JOIN users requester ON requester.id = mr.requester_id
     JOIN users payer ON payer.id = mr.payer_id
     WHERE mr.requester_id = $1 OR mr.payer_id = $1
     ORDER BY mr.created_at DESC`,
    [userId],
  );

  const format = (row: typeof result.rows[number], direction: "INCOMING" | "OUTGOING") => ({
    id: row.id,
    direction,
    person: direction === "INCOMING"
      ? { id: row.requester_id, name: row.requester_name, email: row.requester_email }
      : { id: row.payer_id, name: row.payer_name, email: row.payer_email },
    amountPoysha: Number(row.amount), note: row.note, status: row.status, createdAt: row.created_at,
  });

  return {
    incoming: result.rows.filter((row) => row.payer_id === userId).map((row) => format(row, "INCOMING")),
    outgoing: result.rows.filter((row) => row.requester_id === userId).map((row) => format(row, "OUTGOING")),
  };
}

export async function approveMoneyRequest(requestId: string, payerId: string) {
  const requestResult = await pool.query<{
    id: string; requester_email: string; payer_id: string; amount: string;
    note: string | null; status: string; approved_transaction_id: string | null;
  }>(
    `SELECT mr.id, requester.email AS requester_email, mr.payer_id, mr.amount, mr.note,
            mr.status, mr.approved_transaction_id
     FROM money_requests mr
     JOIN users requester ON requester.id = mr.requester_id
     WHERE mr.id = $1`,
    [requestId],
  );
  const request = requestResult.rows[0];
  if (!request) throw new MoneyRequestNotFoundError();
  if (request.payer_id !== payerId) throw new MoneyRequestForbiddenError();
  if (request.status === "APPROVED") return request.approved_transaction_id;
  if (request.status !== "PENDING") throw new MoneyRequestNotPendingError();

  const transfer = await executeTransfer(payerId, {
    recipientEmail: request.requester_email,
    amountPoysha: Number(request.amount),
    note: request.note ?? undefined,
    idempotencyKey: request.id,
  });

  await pool.query(
    `UPDATE money_requests
     SET status = 'APPROVED', approved_transaction_id = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'PENDING'`,
    [transfer.transaction.id, request.id],
  );
  return transfer.transaction.id;
}

export async function declineMoneyRequest(requestId: string, payerId: string) {
  const result = await pool.query<{ status: string; payer_id: string }>(
    "SELECT status, payer_id FROM money_requests WHERE id = $1", [requestId],
  );
  const request = result.rows[0];
  if (!request) throw new MoneyRequestNotFoundError();
  if (request.payer_id !== payerId) throw new MoneyRequestForbiddenError();
  if (request.status !== "PENDING") throw new MoneyRequestNotPendingError();
  await pool.query("UPDATE money_requests SET status = 'DECLINED', updated_at = NOW() WHERE id = $1", [requestId]);
}
