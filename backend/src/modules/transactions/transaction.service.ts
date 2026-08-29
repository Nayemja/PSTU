import { pool } from "../../db/pool";

interface TransactionHistoryRow {
  id: string;
  type: "SENT" | "RECEIVED";
  person_id: string;
  person_name: string;
  person_email: string;
  amount: string;
  note: string | null;
  status: string;
  created_at: Date;
}

export interface TransactionHistoryItem {
  id: string;
  type: "SENT" | "RECEIVED";
  person: {
    id: string;
    name: string;
    email: string;
  };
  amountPoysha: number;
  note: string | null;
  status: string;
  createdAt: Date;
}

export async function getTransactionHistory(
  userId: string,
): Promise<TransactionHistoryItem[]> {
  const result = await pool.query<TransactionHistoryRow>(
    `SELECT
       transactions.id,
       CASE
         WHEN transactions.sender_account_id = user_account.id THEN 'SENT'
         ELSE 'RECEIVED'
       END AS type,
       other_user.id AS person_id,
       other_user.name AS person_name,
       other_user.email AS person_email,
       transactions.amount,
       transactions.note,
       transactions.status,
       transactions.created_at
     FROM accounts AS user_account
     JOIN transactions
       ON transactions.sender_account_id = user_account.id
       OR transactions.receiver_account_id = user_account.id
     JOIN accounts AS other_account
       ON other_account.id = CASE
         WHEN transactions.sender_account_id = user_account.id
           THEN transactions.receiver_account_id
         ELSE transactions.sender_account_id
       END
     JOIN users AS other_user ON other_user.id = other_account.user_id
     WHERE user_account.user_id = $1
     ORDER BY transactions.created_at DESC`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    person: {
      id: row.person_id,
      name: row.person_name,
      email: row.person_email,
    },
    amountPoysha: Number(row.amount),
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  }));
}
