-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "guestShoppingCreatedAt" TIMESTAMP(3),
ADD COLUMN     "guestShoppingCreatedById" UUID,
ADD COLUMN     "guestShoppingToken" VARCHAR(40);

-- CreateIndex
CREATE UNIQUE INDEX "Household_guestShoppingToken_key" ON "Household"("guestShoppingToken");

