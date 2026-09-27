-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "personal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "title" VARCHAR(200);

-- Entrées existantes : titre et visibilité repris de la tâche concernée.
UPDATE "ActivityLog" a SET "title" = t."title", "personal" = (t."visibility" = 'PERSONAL')
FROM "Task" t WHERE a."entityType" = 'Task' AND a."entityId" = t."id";

UPDATE "ActivityLog" a
SET "title" = COALESCE(o."titleOverride", t."title"), "personal" = (t."visibility" = 'PERSONAL')
FROM "TaskOccurrence" o JOIN "Task" t ON t."id" = o."taskId"
WHERE a."entityType" = 'TaskOccurrence' AND a."entityId" = o."id";

UPDATE "ActivityLog" a SET "title" = t."title", "personal" = (t."visibility" = 'PERSONAL')
FROM "TaskSeries" s JOIN "Task" t ON t."id" = s."taskId"
WHERE a."entityType" = 'TaskSeries' AND a."entityId" = s."id";
