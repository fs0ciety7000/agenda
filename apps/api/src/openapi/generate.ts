/**
 * Écrit le document OpenAPI de l'API (`pnpm --filter @agenda/api openapi [fichier]`), sans base de
 * données ni Redis : Nest est démarré en mode « aperçu » (aucun service instancié). Le fichier
 * alimente la page Swagger de la documentation (apps/docs/static/openapi.json) ; la CI vérifie
 * qu'il est à jour.
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Valeurs factices : seule la forme des routes compte ici.
process.env.DATABASE_URL ??= 'postgresql://openapi@localhost:5432/openapi';
process.env.JWT_SECRET ??= 'openapi-openapi-openapi-openapi-openapi';
process.env.NODE_ENV ??= 'development';

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { VersioningType } = await import('@nestjs/common');
  const { buildOpenApi } = await import('./openapi');
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  app.enableVersioning({ type: VersioningType.URI });
  const document = buildOpenApi(app);
  const out = resolve(process.argv[2] ?? resolve(__dirname, '../../../docs/static/openapi.json'));
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`OpenAPI : ${Object.keys(document.paths).length} chemins → ${out}\n`);
  await app.close();
}

void main();
