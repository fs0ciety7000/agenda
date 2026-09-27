import { z } from 'zod';

/** Commentaire sur une tâche (commun à toutes ses occurrences). */
export const CommentDto = z.object({
  id: z.uuid(),
  /** null = ancien membre. */
  authorId: z.uuid().nullable(),
  body: z.string(),
  createdAt: z.string(),
});
export type CommentDto = z.infer<typeof CommentDto>;

export const CreateCommentInput = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentInput>;
