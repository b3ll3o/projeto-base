-- CreateEnum
CREATE TYPE "audit_operation" AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'RESTORE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_history" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previous_version" INTEGER,
    "operation" "audit_operation" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "reason" TEXT,

    CONSTRAINT "users_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_archive" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" UUID,
    "reason" TEXT,

    CONSTRAINT "users_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at" DESC);

-- CreateIndex
CREATE INDEX "users_history_entity_id_changed_at_idx" ON "users_history"("entity_id", "changed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_history_entity_id_version_key" ON "users_history"("entity_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "users_archive_entity_id_key" ON "users_archive"("entity_id");

-- CreateIndex
CREATE INDEX "users_archive_deleted_at_idx" ON "users_archive"("deleted_at" DESC);
