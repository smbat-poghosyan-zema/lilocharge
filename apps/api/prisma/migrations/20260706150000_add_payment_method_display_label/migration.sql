-- AlterTable: store an optional user-facing label for tokenized payment methods
-- (e.g. "My Idram wallet") registered via POST /users/:userId/payments/methods
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "display_label" TEXT;
