-- CreateTable
CREATE TABLE "MemberAbsence" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberAbsence_householdId_endDate_idx" ON "MemberAbsence"("householdId", "endDate");

-- AddForeignKey
ALTER TABLE "MemberAbsence" ADD CONSTRAINT "MemberAbsence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAbsence" ADD CONSTRAINT "MemberAbsence_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

