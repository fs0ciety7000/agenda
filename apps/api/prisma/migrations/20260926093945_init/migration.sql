-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "TaskVisibility" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RotationMode" AS ENUM ('UNASSIGNED', 'FIXED', 'TOGETHER', 'ALTERNATE', 'SEQUENCE', 'WEEKDAY');

-- CreateEnum
CREATE TYPE "RotationAdvance" AS ENUM ('PER_OCCURRENCE', 'PER_WEEK');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('TODO', 'DONE', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "CalendarLinkStatus" AS ENUM ('ACTIVE', 'INVALID');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'ERROR', 'BLOCKED', 'PENDING_DELETE', 'DELETED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_UPCOMING', 'TASK_OVERDUE', 'TASK_REMINDER', 'TASK_ASSIGNED', 'ASSIGNEE_CHANGED', 'CALENDAR_SYNC_FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" VARCHAR(60) NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerSubject" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "refreshTokenHash" CHAR(64) NOT NULL,
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Brussels',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "displayName" VARCHAR(40) NOT NULL,
    "color" VARCHAR(16) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdInvitation" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "invitedById" UUID NOT NULL,
    "email" CITEXT,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "key" VARCHAR(32),
    "name" VARCHAR(40) NOT NULL,
    "emoji" VARCHAR(16),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "categoryId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(5000),
    "location" VARCHAR(200),
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "visibility" "TaskVisibility" NOT NULL DEFAULT 'SHARED',
    "syncToCalendar" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSeries" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "rule" JSONB NOT NULL,
    "startDate" DATE NOT NULL,
    "untilDate" DATE,
    "count" INTEGER,
    "startMinute" INTEGER,
    "durationMinutes" INTEGER,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "rotationMode" "RotationMode" NOT NULL DEFAULT 'UNASSIGNED',
    "rotationAdvance" "RotationAdvance" NOT NULL DEFAULT 'PER_OCCURRENCE',
    "rotationOffset" INTEGER NOT NULL DEFAULT 0,
    "generatedUntil" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RotationSlot" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "weekday" SMALLINT,
    "position" SMALLINT NOT NULL,
    "memberId" UUID NOT NULL,

    CONSTRAINT "RotationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOccurrence" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "seriesId" UUID,
    "seriesIndex" INTEGER,
    "originalDate" DATE,
    "date" DATE,
    "startMinute" INTEGER,
    "durationMinutes" INTEGER,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'TODO',
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "titleOverride" VARCHAR(200),
    "notesOverride" VARCHAR(5000),
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccurrenceAssignee" (
    "occurrenceId" UUID NOT NULL,
    "memberId" UUID NOT NULL,

    CONSTRAINT "OccurrenceAssignee_pkey" PRIMARY KEY ("occurrenceId","memberId")
);

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "googleSubject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastErrorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdCalendarLink" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "googleCalendarId" VARCHAR(255) NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "accessRole" VARCHAR(32) NOT NULL,
    "timeZone" VARCHAR(64),
    "status" "CalendarLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastErrorCode" VARCHAR(64),
    "lastReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdCalendarLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventLink" (
    "id" UUID NOT NULL,
    "occurrenceId" UUID,
    "calendarLinkId" UUID NOT NULL,
    "googleCalendarId" VARCHAR(255) NOT NULL,
    "googleEventId" VARCHAR(1024) NOT NULL,
    "etag" VARCHAR(255),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedVersion" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(64),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "leadMinutes" INTEGER,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" UUID NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerSubject_key" ON "AuthIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdInvitation_tokenHash_key" ON "HouseholdInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "HouseholdInvitation_householdId_idx" ON "HouseholdInvitation"("householdId");

-- CreateIndex
CREATE INDEX "Category_householdId_idx" ON "Category"("householdId");

-- CreateIndex
CREATE INDEX "Task_householdId_deletedAt_idx" ON "Task"("householdId", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");

-- CreateIndex
CREATE INDEX "TaskSeries_taskId_idx" ON "TaskSeries"("taskId");

-- CreateIndex
CREATE INDEX "RotationSlot_memberId_idx" ON "RotationSlot"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "RotationSlot_seriesId_weekday_position_memberId_key" ON "RotationSlot"("seriesId", "weekday", "position", "memberId");

-- CreateIndex
CREATE INDEX "TaskOccurrence_householdId_date_idx" ON "TaskOccurrence"("householdId", "date");

-- CreateIndex
CREATE INDEX "TaskOccurrence_householdId_status_startsAt_idx" ON "TaskOccurrence"("householdId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "TaskOccurrence_taskId_idx" ON "TaskOccurrence"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOccurrence_seriesId_originalDate_key" ON "TaskOccurrence"("seriesId", "originalDate");

-- CreateIndex
CREATE INDEX "OccurrenceAssignee_memberId_idx" ON "OccurrenceAssignee"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_userId_googleSubject_key" ON "GoogleConnection"("userId", "googleSubject");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdCalendarLink_householdId_key" ON "HouseholdCalendarLink"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventLink_occurrenceId_key" ON "CalendarEventLink"("occurrenceId");

-- CreateIndex
CREATE INDEX "CalendarEventLink_syncStatus_nextAttemptAt_idx" ON "CalendarEventLink"("syncStatus", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventLink_googleCalendarId_googleEventId_key" ON "CalendarEventLink"("googleCalendarId", "googleEventId");

-- CreateIndex
CREATE INDEX "Notification_memberId_readAt_idx" ON "Notification"("memberId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_memberId_type_key" ON "NotificationPreference"("memberId", "type");

-- CreateIndex
CREATE INDEX "ActivityLog_householdId_createdAt_idx" ON "ActivityLog"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvitation" ADD CONSTRAINT "HouseholdInvitation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvitation" ADD CONSTRAINT "HouseholdInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "HouseholdMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceAssignee" ADD CONSTRAINT "OccurrenceAssignee_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceAssignee" ADD CONSTRAINT "OccurrenceAssignee_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdCalendarLink" ADD CONSTRAINT "HouseholdCalendarLink_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdCalendarLink" ADD CONSTRAINT "HouseholdCalendarLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventLink" ADD CONSTRAINT "CalendarEventLink_calendarLinkId_fkey" FOREIGN KEY ("calendarLinkId") REFERENCES "HouseholdCalendarLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "HouseholdMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────── Contraintes non exprimables en Prisma (cf. docs/database.md) ─────────

-- Nom de catégorie unique par foyer parmi les catégories non supprimées.
CREATE UNIQUE INDEX "Category_householdId_name_active_key"
  ON "Category" ("householdId", lower("name")) WHERE "deletedAt" IS NULL;

-- Une tâche personnelle n'est jamais synchronisée dans le calendrier partagé.
ALTER TABLE "Task" ADD CONSTRAINT "Task_personal_not_synced_check"
  CHECK (NOT ("visibility" = 'PERSONAL' AND "syncToCalendar"));

ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_startMinute_check"
  CHECK ("startMinute" IS NULL OR "startMinute" BETWEEN 0 AND 1439);
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_duration_check"
  CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_until_check"
  CHECK ("untilDate" IS NULL OR "untilDate" >= "startDate");
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_count_check"
  CHECK ("count" IS NULL OR "count" > 0);

ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_startMinute_check"
  CHECK ("startMinute" IS NULL OR "startMinute" BETWEEN 0 AND 1439);
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_duration_check"
  CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_done_check"
  CHECK (("status" = 'DONE') = ("completedAt" IS NOT NULL));

-- 0 = lundi … 6 = dimanche.
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_weekday_check"
  CHECK ("weekday" IS NULL OR "weekday" BETWEEN 0 AND 6);
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_position_check"
  CHECK ("position" >= 0);
