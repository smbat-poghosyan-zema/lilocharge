-- CreateEnum: wallet ledger rows gain a lifecycle status so top-ups can persist their
-- gateway idempotency keys on a durable PENDING row BEFORE the first gateway call
-- (guarded so re-running the migration is a no-op)
DO $$
BEGIN
  CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- AlterTable: existing ledger rows were only ever written after a successful balance
-- movement, so they backfill as COMPLETED
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "status" "WalletTransactionStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateIndex: one gateway idempotency key belongs to at most one ledger row
-- (Postgres unique indexes ignore NULLs, so key-less DEDUCTION/REFUND rows are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- Defense in depth: wallet balances must never go negative even if an application-level
-- guard regresses (application code uses conditional decrements as the primary guard)
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_balance_non_negative";
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);
