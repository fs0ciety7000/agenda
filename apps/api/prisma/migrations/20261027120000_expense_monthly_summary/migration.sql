-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_MONTHLY';

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "expenseSummaryMonth" TEXT;

