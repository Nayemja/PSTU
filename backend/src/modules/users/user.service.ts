import { pool } from "../../db/pool";

export async function searchUsers(userId: string, query: string) {
  const result = await pool.query<{ id: string; name: string; email: string }>(
    `SELECT id, name, email
     FROM users
     WHERE id <> $1
       AND (name ILIKE $2 OR LOWER(email) = LOWER($3))
     ORDER BY CASE WHEN LOWER(email) = LOWER($3) THEN 0 ELSE 1 END, name
     LIMIT 5`,
    [userId, `%${query}%`, query],
  );

  return result.rows;
}
