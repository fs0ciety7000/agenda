-- weekday NULL = « tous les jours » : deux NULL doivent être considérés égaux (PostgreSQL ≥ 15).
DROP INDEX "RotationSlot_seriesId_weekday_position_memberId_key";
CREATE UNIQUE INDEX "RotationSlot_seriesId_weekday_position_memberId_key"
  ON "RotationSlot" ("seriesId", "weekday", "position", "memberId") NULLS NOT DISTINCT;
