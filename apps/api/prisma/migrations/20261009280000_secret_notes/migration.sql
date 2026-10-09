-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "secret" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "vaultUnlockedUntil" TIMESTAMP(3);

