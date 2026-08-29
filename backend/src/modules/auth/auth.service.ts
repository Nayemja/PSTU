import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { sendRegistrationOtp } from "../../services/mail.service";
import type { LoginInput, RegisterInput, VerifyOtpInput } from "./auth.schema";

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
}

interface AccountRow {
  balance: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResult {
  user: AuthUser;
  balancePoysha: number;
  token: string;
}

export class DuplicateEmailError extends Error {}
export class InvalidOtpError extends Error {}
export class ExpiredOtpError extends Error {}

interface PendingRegistration {
  name: string;
  email: string;
  passwordHash: string;
  otp: string;
  expiresAt: number;
}

const pendingRegistrations = new Map<string, PendingRegistration>();
const OTP_LIFETIME_MS = 5 * 60 * 1000;

function createToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "1d" });
}

export async function requestRegistrationOtp(input: RegisterInput): Promise<string> {
  const existingUser = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [input.email],
  );

  if (existingUser.rowCount) {
    throw new DuplicateEmailError();
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await sendRegistrationOtp(input.email, otp);

  pendingRegistrations.set(input.email, {
    name: input.name,
    email: input.email,
    passwordHash,
    otp,
    expiresAt: Date.now() + OTP_LIFETIME_MS,
  });

  return otp;
}

export async function verifyRegistrationOtp(input: VerifyOtpInput): Promise<AuthResult> {
  const pending = pendingRegistrations.get(input.email);

  if (!pending) {
    throw new InvalidOtpError();
  }

  if (Date.now() > pending.expiresAt) {
    pendingRegistrations.delete(input.email);
    throw new ExpiredOtpError();
  }

  if (pending.otp !== input.otp) {
    throw new InvalidOtpError();
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query<UserRow>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, password_hash`,
      [pending.name, pending.email, pending.passwordHash],
    );
    const user = userResult.rows[0];

    const accountResult = await client.query<AccountRow>(
      `INSERT INTO accounts (user_id)
       VALUES ($1)
       RETURNING balance`,
      [user.id],
    );

    await client.query("COMMIT");
    pendingRegistrations.delete(input.email);

    return {
      user: { id: user.id, name: user.name, email: user.email },
      balancePoysha: Number(accountResult.rows[0].balance),
      token: createToken(user.id),
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new DuplicateEmailError();
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function loginUser(input: LoginInput): Promise<AuthResult | null> {
  const userResult = await pool.query<UserRow>(
    `SELECT id, name, email, password_hash
     FROM users
     WHERE email = $1`,
    [input.email],
  );
  const user = userResult.rows[0];

  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    return null;
  }

  const accountResult = await pool.query<AccountRow>(
    "SELECT balance FROM accounts WHERE user_id = $1",
    [user.id],
  );
  const account = accountResult.rows[0];

  if (!account) {
    throw new Error("User account is missing");
  }

  return {
    user: { id: user.id, name: user.name, email: user.email },
    balancePoysha: Number(account.balance),
    token: createToken(user.id),
  };
}

export async function getCurrentUser(
  userId: string,
): Promise<Omit<AuthResult, "token"> | null> {
  const result = await pool.query<UserRow & AccountRow>(
    `SELECT users.id, users.name, users.email, accounts.balance
     FROM users
     JOIN accounts ON accounts.user_id = users.id
     WHERE users.id = $1`,
    [userId],
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    user: { id: row.id, name: row.name, email: row.email },
    balancePoysha: Number(row.balance),
  };
}
