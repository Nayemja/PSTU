CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  balance BIGINT NOT NULL DEFAULT 10000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_balance_nonnegative CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id UUID NOT NULL REFERENCES accounts(id),
  receiver_account_id UUID NOT NULL REFERENCES accounts(id),
  amount BIGINT NOT NULL,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_amount_positive CHECK (amount > 0),
  CONSTRAINT transactions_distinct_accounts CHECK (sender_account_id <> receiver_account_id),
  CONSTRAINT transactions_valid_status CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  CONSTRAINT transactions_sender_idempotency_unique UNIQUE (sender_account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  entry_type VARCHAR(10) NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ledger_entries_valid_type CHECK (entry_type IN ('DEBIT', 'CREDIT')),
  CONSTRAINT ledger_entries_amount_positive CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS money_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id),
  payer_id UUID NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  approved_transaction_id UUID REFERENCES transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT money_requests_amount_positive CHECK (amount > 0),
  CONSTRAINT money_requests_distinct_users CHECK (requester_id <> payer_id),
  CONSTRAINT money_requests_valid_status CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED'))
);

CREATE INDEX IF NOT EXISTS transactions_sender_created_at_idx
  ON transactions (sender_account_id, created_at);

CREATE INDEX IF NOT EXISTS transactions_receiver_created_at_idx
  ON transactions (receiver_account_id, created_at);

CREATE INDEX IF NOT EXISTS ledger_entries_account_created_at_idx
  ON ledger_entries (account_id, created_at);

CREATE INDEX IF NOT EXISTS ledger_entries_transaction_id_idx
  ON ledger_entries (transaction_id);

CREATE INDEX IF NOT EXISTS money_requests_payer_status_created_at_idx
  ON money_requests (payer_id, status, created_at);

CREATE INDEX IF NOT EXISTS money_requests_requester_created_at_idx
  ON money_requests (requester_id, created_at);
