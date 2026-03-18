-- CreateEnum
CREATE TYPE "ProblemType" AS ENUM ('OFFLINE', 'BROKEN_CONNECTOR', 'NO_POWER', 'PAYMENT_ISSUE', 'PHYSICAL_DAMAGE', 'ACCESS_BLOCKED', 'OTHER');

-- CreateEnum
CREATE TYPE "ProblemReportStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "station_problem_reports" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "problem_type" "ProblemType" NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ProblemReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "station_problem_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "station_problem_reports_station_id_idx" ON "station_problem_reports"("station_id");

-- CreateIndex
CREATE INDEX "station_problem_reports_user_id_idx" ON "station_problem_reports"("user_id");

-- CreateIndex
CREATE INDEX "station_problem_reports_status_idx" ON "station_problem_reports"("status");

-- CreateIndex
CREATE INDEX "station_problem_reports_created_at_idx" ON "station_problem_reports"("created_at");

-- AddForeignKey
ALTER TABLE "station_problem_reports" ADD CONSTRAINT "station_problem_reports_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_problem_reports" ADD CONSTRAINT "station_problem_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
