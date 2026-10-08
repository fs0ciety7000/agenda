-- CreateTable
CREATE TABLE "ExpenseCategoryBudget" (
    "householdId" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "budgetCents" INTEGER NOT NULL,

    CONSTRAINT "ExpenseCategoryBudget_pkey" PRIMARY KEY ("householdId","category")
);

-- AddForeignKey
ALTER TABLE "ExpenseCategoryBudget" ADD CONSTRAINT "ExpenseCategoryBudget_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

