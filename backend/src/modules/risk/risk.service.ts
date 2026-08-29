import { pool } from "../../db/pool";

export async function previewTransfer(userId: string, recipientEmail: string, amountPoysha: number) {
  const result = await pool.query<{ previous_count: string; average_amount: string | null }>(
    `SELECT
       (SELECT COUNT(*)::text FROM transactions t
        WHERE t.status = 'COMPLETED'
          AND ((t.sender_account_id = sender.id AND t.receiver_account_id = recipient.id)
            OR (t.sender_account_id = recipient.id AND t.receiver_account_id = sender.id))) AS previous_count,
       (SELECT AVG(t.amount)::text FROM transactions t
        WHERE t.status = 'COMPLETED' AND t.sender_account_id = sender.id) AS average_amount
     FROM accounts sender
     JOIN users recipient_user ON recipient_user.email = $2
     JOIN accounts recipient ON recipient.user_id = recipient_user.id
     WHERE sender.user_id = $1`,
    [userId, recipientEmail],
  );
  const data = result.rows[0];
  if (!data) return null;

  const reasons: string[] = [];
  if (data.previous_count === "0") reasons.push("This is your first transaction with this account.");
  if (data.average_amount && amountPoysha > Number(data.average_amount) * 3)
    reasons.push("This amount is significantly higher than your usual transfer.");
  if (amountPoysha >= 2000000) reasons.push("This is a large payment.");

  return {
    requiresReview: reasons.length > 0,
    riskLevel: reasons.length === 0 ? "LOW" : reasons.length === 1 ? "MEDIUM" : "HIGH",
    reasons,
  };
}
