/** Conversions entre les dates « murales » (`YYYY-MM-DD`) et les colonnes PostgreSQL `DATE`. */
export const toDbDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
export const fromDbDate = (date: Date | null): string | null =>
  date ? date.toISOString().slice(0, 10) : null;
