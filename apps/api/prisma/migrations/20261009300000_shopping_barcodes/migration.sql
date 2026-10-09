-- CreateTable
CREATE TABLE "ShoppingBarcode" (
    "householdId" UUID NOT NULL,
    "code" VARCHAR(14) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingBarcode_pkey" PRIMARY KEY ("householdId","code")
);

-- AddForeignKey
ALTER TABLE "ShoppingBarcode" ADD CONSTRAINT "ShoppingBarcode_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

