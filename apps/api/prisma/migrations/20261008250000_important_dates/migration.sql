-- CreateEnum
CREATE TYPE "ImportantDateKind" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'MAINTENANCE', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'IMPORTANT_DATE';

-- CreateTable
CREATE TABLE "ImportantDate" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "kind" "ImportantDateKind" NOT NULL DEFAULT 'OTHER',
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "repeatsYearly" BOOLEAN NOT NULL DEFAULT true,
    "remindDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "remindedFor" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportantDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportantDate_householdId_idx" ON "ImportantDate"("householdId");

-- AddForeignKey
ALTER TABLE "ImportantDate" ADD CONSTRAINT "ImportantDate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

