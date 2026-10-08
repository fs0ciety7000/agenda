-- AlterEnum
ALTER TYPE "ExpenseSplit" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "recurringId" UUID,
ADD COLUMN     "recurringMonth" VARCHAR(7);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "paidById" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "split" "ExpenseSplit" NOT NULL DEFAULT 'SHARED',
    "forMemberId" UUID,
    "note" VARCHAR(500),
    "dayOfMonth" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "lastMonth" VARCHAR(7),
    "endedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReceipt" (
    "expenseId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(127) NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseReceipt_pkey" PRIMARY KEY ("expenseId")
);

-- CreateIndex
CREATE INDEX "RecurringExpense_householdId_idx" ON "RecurringExpense"("householdId");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_householdId_idx" ON "ExpenseReceipt"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringId_recurringMonth_key" ON "Expense"("recurringId", "recurringMonth");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

