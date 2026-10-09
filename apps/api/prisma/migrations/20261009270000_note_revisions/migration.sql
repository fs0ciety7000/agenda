-- CreateTable
CREATE TABLE "NoteRevision" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL,
    "editedById" UUID,
    "savedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteRevision_noteId_version_idx" ON "NoteRevision"("noteId", "version");

-- AddForeignKey
ALTER TABLE "NoteRevision" ADD CONSTRAINT "NoteRevision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

