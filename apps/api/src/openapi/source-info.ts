import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MethodInfo {
  /** Type de retour tel qu'écrit (`Promise<OccurrenceDto[]>`). */
  returnType: string | null;
  /** Première phrase du commentaire JSDoc. */
  summary: string | null;
  description: string | null;
}

export type SourceInfo = Map<string, Map<string, MethodInfo>>;

/**
 * Lit les contrôleurs TypeScript (types de retour, commentaires JSDoc) : les types sont effacés à
 * la compilation, seule la source dit qu'une route renvoie un `OccurrenceDto`. Absente de l'image
 * de production (pas de `src/`, pas de `typescript`) : la documentation reste alors sans réponses
 * typées, sans erreur.
 */
export function readSourceInfo(srcDir: string): SourceInfo {
  const info: SourceInfo = new Map();
  if (!existsSync(srcDir)) return info;
  let ts: typeof import('typescript');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ts = require('typescript') as typeof import('typescript');
  } catch {
    return info;
  }
  for (const file of controllerFiles(srcDir)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const methods = new Map<string, MethodInfo>();
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) continue;
        const doc = ts
          .getJSDocCommentsAndTags(member)
          .filter(ts.isJSDoc)
          .map((d) => (typeof d.comment === 'string' ? d.comment : ''))
          .join('\n')
          .replace(/\s*\n\s*/g, ' ')
          .trim();
        const [first, ...rest] = doc ? doc.split(/(?<=[.:!?])\s+/) : [];
        methods.set(member.name.text, {
          returnType: member.type ? member.type.getText(source).replace(/\s+/g, ' ') : null,
          summary: first ? first.replace(/[.:]$/, '') : null,
          description: doc || null,
        });
        if (rest.length === 0 && doc) methods.get(member.name.text)!.description = null;
      }
      info.set(node.name.text, methods);
    });
  }
  return info;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return controllerFiles(path);
    return e.name.endsWith('.controller.ts') ? [path] : [];
  });
}
