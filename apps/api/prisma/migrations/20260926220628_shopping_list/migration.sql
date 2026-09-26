-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "doneById" UUID,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingItem_householdId_done_idx" ON "ShoppingItem"("householdId", "done");

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
