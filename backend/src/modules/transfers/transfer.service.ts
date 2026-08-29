
import type { PoolClient } from "pg";

import { pool } from "../../db/pool";
import type { TransferInput } from "./transfer.schema";

interface AccountIdentityRow {
  account_id: string;
  user_id: string;
  name: string;
  email: string;
}

interface TransactionRow {
  id: string;
  receiver_account_id: string;
  amount: string;
  note: string | null;
  status: string;
  created_at: Date;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string;
  sender_balance_after: string;
}

export interface TransferResult {
  transaction: {
    id: string;
    recipient: { id: string; name: string; email: string };
    amountPoysha: number;
    note: string | null;
    status: string;
    createdAt: Date;
  };
  senderBalancePoysha: number;
  idempotentReplay: boolean;
}

export class RecipientNotFoundError extends Error {}
export class SelfTransferError extends Error {}
export class InsufficientFundsError extends Error {}
export class IdempotencyConflictError extends Error {}

async function findExistingTransaction(
  client: PoolClient,
  senderAccountId: string,
  idempotencyKey: string,
): Promise<TransactionRow | undefined> {
  const result = await client.query<TransactionRow>(
    `SELECT
       transactions.id,
       transactions.receiver_account_id,
       transactions.amount,
       transactions.note,
       transactions.status,
       transactions.created_at,
       recipient_users.id AS recipient_id,
       recipient_users.name AS recipient_name,
       recipient_users.email AS recipient_email,
       COALESCE(debit_entry.balance_after, sender_account.balance) AS sender_balance_after
     FROM transactions
     JOIN accounts AS recipient_account
       ON recipient_account.id = transactions.receiver_account_id
     JOIN users AS recipient_users
       ON recipient_users.id = recipient_account.user_id
     JOIN accounts AS sender_account
       ON sender_account.id = transactions.sender_account_id
     LEFT JOIN ledger_entries AS debit_entry
       ON debit_entry.transaction_id = transactions.id
      AND debit_entry.account_id = transactions.sender_account_id
      AND debit_entry.entry_type = 'DEBIT'
     WHERE transactions.sender_account_id = $1
       AND transactions.idempotency_key = $2`,
    [senderAccountId, idempotencyKey],
  );

  return result.rows[0];
}

function existingTransferResult(
  existing: TransactionRow,
  receiverAccountId: string,
  input: TransferInput,
): TransferResult {
  const requestedNote = input.note ?? null;

  if (
    existing.receiver_account_id !== receiverAccountId ||
    existing.amount !== String(input.amountPoysha) ||
    existing.note !== requestedNote
  ) {
    throw new IdempotencyConflictError();
  }

  return {
    transaction: {
      id: existing.id,
      recipient: {
        id: existing.recipient_id,
        name: existing.recipient_name,
        email: existing.recipient_email,
      },
      amountPoysha: Number(existing.amount),
      note: existing.note,
      status: existing.status,
      createdAt: existing.created_at,
    },
    senderBalancePoysha: Number(existing.sender_balance_after),
    idempotentReplay: true,
  };
}

export async function executeTransfer(
  senderUserId: string,
  input: TransferInput,
): Promise<TransferResult> {
  const client = await pool.connect();

  try {
    // Both balance changes and ledger writes use one DB transaction
    // so money cannot be partially transferred.
    await client.query("BEGIN");

    const senderResult = await client.query<AccountIdentityRow>(
      `SELECT accounts.id AS account_id, users.id AS user_id, users.name, users.email
       FROM accounts
       JOIN users ON users.id = accounts.user_id
       WHERE users.id = $1`,
      [senderUserId],
    );
    const sender = senderResult.rows[0];

    if (!sender) {
      throw new Error("Sender account is missing");
    }

    const recipientResult = await client.query<AccountIdentityRow>(
      `SELECT accounts.id AS account_id, users.id AS user_id, users.name, users.email
       FROM users
       JOIN accounts ON accounts.user_id = users.id
       WHERE users.email = $1`,
      [input.recipientEmail],
    );
    const recipient = recipientResult.rows[0];

    if (!recipient) {
      throw new RecipientNotFoundError();
    }

    if (recipient.user_id === sender.user_id) {
      throw new SelfTransferError();
    }

    const existing = await findExistingTransaction(
      client,
      sender.account_id,
      input.idempotencyKey,
    );

    if (existing) {
      const result = existingTransferResult(
        existing,
        recipient.account_id,
        input,
      );
      await client.query("COMMIT");
      return result;
    }

    const transactionResult = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO transactions (
         sender_account_id,
         receiver_account_id,
         amount,
         note,
         status,
         idempotency_key
       )
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       ON CONFLICT (sender_account_id, idempotency_key) DO NOTHING
       RETURNING id, created_at`,
      [
        sender.account_id,
        recipient.account_id,
        input.amountPoysha,
        input.note ?? null,
        input.idempotencyKey,
      ],
    );
    const transaction = transactionResult.rows[0];

    // A concurrent retry may have committed while this request waited
    // on the unique idempotency constraint.
    if (!transaction) {
      const concurrentExisting = await findExistingTransaction(
        client,
        sender.account_id,
        input.idempotencyKey,
      );

      if (!concurrentExisting) {
        throw new Error("Idempotent transaction was not found");
      }

      const result = existingTransferResult(
        concurrentExisting,
        recipient.account_id,
        input,
      );
      await client.query("COMMIT");
      return result;
    }

    // PostgreSQL enforces sufficient balance during the update, even when
    // two transfer requests run concurrently.
    const debitResult = await client.query<{ balance: string }>(
      `UPDATE accounts
       SET balance = balance - $1
       WHERE id = $2 AND balance >= $1
       RETURNING balance`,
      [input.amountPoysha, sender.account_id],
    );
    const senderBalance = debitResult.rows[0];

    if (!senderBalance) {
      throw new InsufficientFundsError();
    }

    const creditResult = await client.query<{ balance: string }>(
      `UPDATE accounts
       SET balance = balance + $1
       WHERE id = $2
       RETURNING balance`,
      [input.amountPoysha, recipient.account_id],
    );
    const receiverBalance = creditResult.rows[0];

    if (!receiverBalance) {
      throw new Error("Recipient account is missing");
    }

    await client.query(
      `INSERT INTO ledger_entries (
         transaction_id,
         account_id,
         entry_type,
         amount,
         balance_after
       )
       VALUES
         ($1, $2, 'DEBIT', $3, $4),
         ($1, $5, 'CREDIT', $3, $6)`,
      [
        transaction.id,
        sender.account_id,
        input.amountPoysha,
        senderBalance.balance,
        recipient.account_id,
        receiverBalance.balance,
      ],
    );

    await client.query(
      `UPDATE transactions
       SET status = 'COMPLETED', updated_at = NOW()
       WHERE id = $1`,
      [transaction.id],
    );

    await client.query("COMMIT");

    return {
      transaction: {
        id: transaction.id,
        recipient: {
          id: recipient.user_id,
          name: recipient.name,
          email: recipient.email,
        },
        amountPoysha: input.amountPoysha,
        note: input.note ?? null,
        status: "COMPLETED",
        createdAt: transaction.created_at,
      },
      senderBalancePoysha: Number(senderBalance.balance),
      idempotentReplay: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
