// Copie Swagger UI (déjà empaqueté) dans static/ : chargé par la page /api-reference sans passer
// par webpack (Swagger UI dépend de modules Node que le navigateur n'a pas).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('swagger-ui-dist/package.json'));
const out = new URL('../static/swagger/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
for (const file of ['swagger-ui-bundle.js', 'swagger-ui.css']) copyFileSync(join(dist, file), join(out, file));
