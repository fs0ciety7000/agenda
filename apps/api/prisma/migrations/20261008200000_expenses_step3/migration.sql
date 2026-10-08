-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_BUDGET';

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "expenseBudgetCents" INTEGER;

