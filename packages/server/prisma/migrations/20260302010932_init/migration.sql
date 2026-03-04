-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "walkthrough_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "health_status" AS ENUM ('HEALTHY', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "walkthroughs" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "status" "walkthrough_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,

    CONSTRAINT "walkthroughs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walkthrough_versions" (
    "id" TEXT NOT NULL,
    "walkthrough_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "embedding" vector(384),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changelog" TEXT,

    CONSTRAINT "walkthrough_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "walkthrough_id" TEXT NOT NULL,
    "walkthrough_version" INTEGER NOT NULL,
    "current_step_id" TEXT NOT NULL,
    "current_step_order" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "walkthrough_id" TEXT NOT NULL,
    "walkthrough_version" INTEGER NOT NULL,
    "step_id" TEXT,
    "session_id" TEXT NOT NULL,
    "page_url" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_summaries" (
    "id" TEXT NOT NULL,
    "walkthrough_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "starts" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "abandonments" INTEGER NOT NULL DEFAULT 0,
    "avg_time_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "step_drop_off" JSONB,

    CONSTRAINT "analytics_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walkthrough_health_records" (
    "id" TEXT NOT NULL,
    "walkthrough_id" TEXT NOT NULL,
    "walkthrough_version" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "status" "health_status" NOT NULL DEFAULT 'HEALTHY',
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stepResults" JSONB NOT NULL,
    "auto_heals_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "walkthrough_health_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "walkthroughs_app_id_status_idx" ON "walkthroughs"("app_id", "status");

-- CreateIndex
CREATE INDEX "walkthroughs_created_by_idx" ON "walkthroughs"("created_by");

-- CreateIndex
CREATE INDEX "walkthrough_versions_walkthrough_id_idx" ON "walkthrough_versions"("walkthrough_id");

-- CreateIndex
CREATE UNIQUE INDEX "walkthrough_versions_walkthrough_id_version_key" ON "walkthrough_versions"("walkthrough_id", "version");

-- CreateIndex
CREATE INDEX "user_progress_user_id_idx" ON "user_progress"("user_id");

-- CreateIndex
CREATE INDEX "user_progress_walkthrough_id_idx" ON "user_progress"("walkthrough_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_user_id_walkthrough_id_key" ON "user_progress"("user_id", "walkthrough_id");

-- CreateIndex
CREATE INDEX "analytics_events_walkthrough_id_type_idx" ON "analytics_events"("walkthrough_id", "type");

-- CreateIndex
CREATE INDEX "analytics_events_user_id_idx" ON "analytics_events"("user_id");

-- CreateIndex
CREATE INDEX "analytics_events_timestamp_idx" ON "analytics_events"("timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_session_id_idx" ON "analytics_events"("session_id");

-- CreateIndex
CREATE INDEX "analytics_summaries_walkthrough_id_period_idx" ON "analytics_summaries"("walkthrough_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_summaries_walkthrough_id_period_period_start_key" ON "analytics_summaries"("walkthrough_id", "period", "period_start");

-- CreateIndex
CREATE INDEX "walkthrough_health_records_walkthrough_id_idx" ON "walkthrough_health_records"("walkthrough_id");

-- CreateIndex
CREATE INDEX "walkthrough_health_records_checked_at_idx" ON "walkthrough_health_records"("checked_at");

-- AddForeignKey
ALTER TABLE "walkthrough_versions" ADD CONSTRAINT "walkthrough_versions_walkthrough_id_fkey" FOREIGN KEY ("walkthrough_id") REFERENCES "walkthroughs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_walkthrough_id_fkey" FOREIGN KEY ("walkthrough_id") REFERENCES "walkthroughs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_walkthrough_id_fkey" FOREIGN KEY ("walkthrough_id") REFERENCES "walkthroughs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walkthrough_health_records" ADD CONSTRAINT "walkthrough_health_records_walkthrough_id_fkey" FOREIGN KEY ("walkthrough_id") REFERENCES "walkthroughs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
