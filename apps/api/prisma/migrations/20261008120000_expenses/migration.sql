-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('EXPENSE', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "ExpenseSplit" AS ENUM ('SHARED', 'FOR_OTHER', 'PERSONAL');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('GROCERIES', 'HOUSING', 'UTILITIES', 'TRANSPORT', 'LEISURE', 'HEALTH', 'KIDS', 'GIFTS', 'OTHER');

-- AlterTable
ALTER TABLE "HouseholdMember" ADD COLUMN     "expenseWeight" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "kind" "ExpenseKind" NOT NULL DEFAULT 'EXPENSE',
    "paidById" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "split" "ExpenseSplit" NOT NULL DEFAULT 'SHARED',
    "forMemberId" UUID,
    "note" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseShare" (
    "expenseId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "ExpenseShare_pkey" PRIMARY KEY ("expenseId","memberId")
);

-- CreateIndex
CREATE INDEX "Expense_householdId_date_idx" ON "Expense"("householdId", "date");

-- CreateIndex
CREATE INDEX "ExpenseShare_memberId_idx" ON "ExpenseShare"("memberId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_forMemberId_fkey" FOREIGN KEY ("forMemberId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseShare" ADD CONSTRAINT "ExpenseShare_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

