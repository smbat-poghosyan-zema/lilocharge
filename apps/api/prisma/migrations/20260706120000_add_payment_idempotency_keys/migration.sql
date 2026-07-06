-- AlterTable: persist per-operation gateway idempotency keys on payments so retries reuse the same key
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "preauth_idempotency_key" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "capture_idempotency_key" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refund_idempotency_key" TEXT;

-- AlterTable: persist the gateway idempotency key used for wallet top-up debit/capture operations
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

-- CreateIndex: gateway webhooks/callbacks look payments up by gateway transaction id
CREATE INDEX IF NOT EXISTS "payments_gateway_transaction_id_idx" ON "payments"("gateway_transaction_id");
