-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN     "aisle" VARCHAR(16),
ADD COLUMN     "quantity" VARCHAR(40);

-- CreateTable
CREATE TABLE "ShoppingProduct" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "aisle" VARCHAR(16) NOT NULL,
    "timesBought" INTEGER NOT NULL DEFAULT 0,
    "lastBoughtAt" TIMESTAMP(3),
    "lastAddedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingProduct_householdId_key_key" ON "ShoppingProduct"("householdId", "key");

-- AddForeignKey
ALTER TABLE "ShoppingProduct" ADD CONSTRAINT "ShoppingProduct_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

