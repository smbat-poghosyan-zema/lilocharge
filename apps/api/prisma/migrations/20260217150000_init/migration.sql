-- Baseline schema for LiloCharge (initial state before 20260217154000).
-- Creates the core tables that all later migrations assume already exist,
-- so that `prisma migrate deploy` works on a fresh database.
-- Objects introduced by later migrations (PostGIS location column,
-- meter_values, favorite_stations, user_push_tokens, station_problem_reports)
-- are intentionally NOT created here.
-- For databases that already contain this schema, mark it applied with:
--   prisma migrate resolve --applied 20260217150000_init

-- Required by the geospatial migration (20260217154000), which assumes the
-- extension already exists.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('HY', 'RU', 'EN');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('TYPE_1', 'TYPE_2', 'CCS', 'CHADEMO', 'TESLA', 'GBT');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('ARCA', 'IDRAM', 'APPLE_PAY', 'GOOGLE_PAY', 'WALLET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('TOP_UP', 'DEDUCTION', 'REFUND');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT,
    "display_name" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'HY',
    "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "marketing_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "connector_type" "ConnectorType" NOT NULL,
    "battery_capacity" DOUBLE PRECISION NOT NULL,
    "max_charge_power" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "token" TEXT NOT NULL,
    "last4" CHAR(4),
    "expiry_month" INTEGER,
    "expiry_year" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "payment_method_id" UUID NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "authorized_amount" INTEGER NOT NULL,
    "captured_amount" INTEGER NOT NULL,
    "gateway_transaction_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" UUID NOT NULL,
    "operator_id" TEXT NOT NULL,
    "operator_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" "StationStatus" NOT NULL DEFAULT 'AVAILABLE',
    "opening_hours" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connectors" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "evse_id" TEXT NOT NULL,
    "connector_type" "ConnectorType" NOT NULL,
    "power_kw" DOUBLE PRECISION NOT NULL,
    "status" "StationStatus" NOT NULL DEFAULT 'AVAILABLE',
    "last_status_update" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" UUID NOT NULL,
    "connector_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_per_kwh" INTEGER,
    "price_per_minute" INTEGER,
    "session_fee" INTEGER,
    "idle_fee" INTEGER,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "connector_id" UUID,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "start_time" TIMESTAMPTZ,
    "end_time" TIMESTAMPTZ,
    "energy_delivered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peak_power" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_cost" INTEGER NOT NULL DEFAULT 0,
    "transaction_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_status_updates" (
    "id" UUID NOT NULL,
    "connector_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "StationStatus" NOT NULL,
    "comment" TEXT,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "connector_status_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "gateway" "PaymentGateway",
    "gateway_transaction_id" TEXT,
    "session_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "vehicles_user_id_idx" ON "vehicles"("user_id");

-- CreateIndex
CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_session_id_key" ON "payments"("session_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_payment_method_id_idx" ON "payments"("payment_method_id");

-- CreateIndex
CREATE INDEX "connectors_station_id_idx" ON "connectors"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "connectors_station_id_evse_id_key" ON "connectors"("station_id", "evse_id");

-- CreateIndex
CREATE INDEX "pricing_plans_connector_id_idx" ON "pricing_plans"("connector_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_vehicle_id_idx" ON "sessions"("vehicle_id");

-- CreateIndex
CREATE INDEX "sessions_connector_id_idx" ON "sessions"("connector_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_start_time_idx" ON "sessions"("start_time");

-- CreateIndex
CREATE INDEX "sessions_created_at_idx" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "reviews_station_id_idx" ON "reviews"("station_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "connector_status_updates_connector_id_idx" ON "connector_status_updates"("connector_id");

-- CreateIndex
CREATE INDEX "connector_status_updates_user_id_idx" ON "connector_status_updates"("user_id");

-- CreateIndex
CREATE INDEX "connector_status_updates_created_at_idx" ON "connector_status_updates"("created_at");

-- CreateIndex
CREATE INDEX "connector_status_updates_confidence_score_idx" ON "connector_status_updates"("confidence_score");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");

-- CreateIndex
CREATE INDEX "wallet_transactions_created_at_idx" ON "wallet_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_status_updates" ADD CONSTRAINT "connector_status_updates_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_status_updates" ADD CONSTRAINT "connector_status_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
