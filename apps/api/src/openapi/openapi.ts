import { INestApplication, RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ModulesContainer } from '@nestjs/core';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import * as contracts from '@agenda/contracts';
import { join } from 'node:path';
import { z, type ZodType } from 'zod';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SKIP_CSRF } from '../auth/csrf.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { IS_PUBLIC } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { readSourceInfo, type SourceInfo } from './source-info';

type JsonSchema = Record<string, unknown>;
const REF = '#/components/schemas/';

/** Schémas Zod exportés par @agenda/contracts, retrouvés par identité (→ `$ref` nommé). */
const namedSchemas = new Map<ZodType, string>(
  Object.entries(contracts as Record<string, unknown>)
    .filter((e): e is [string, ZodType] => e[1] instanceof z.ZodType)
    .map(([name, schema]) => [schema, name]),
);

const TAGS: [string, string][] = [
  ['auth', 'Comptes, connexion, jetons, mot de passe, Google Sign-In'],
  ['households', 'Foyers, membres, invitations'],
  ['tasks', 'Tâches, occurrences, séries répétées, sous-tâches, statistiques'],
  ['categories', 'Catégories de tâches'],
  ['templates', 'Modèles de tâches'],
  ['comments', 'Commentaires sur une tâche'],
  ['attachments', 'Pièces jointes'],
  ['absences', 'Mode absence'],
  ['activity', 'Journal d’activité et corbeille'],
  ['shopping', 'Liste de courses partagée'],
  ['notifications', 'Centre de notifications, préférences, push Android et navigateur'],
  ['calendar', 'Synchronisation Google Agenda'],
  ['inbound-email', 'Tâches par e-mail'],
  ['realtime', 'Temps réel (Server-Sent Events)'],
  ['reports', 'Signalements : bug, idée, question'],
  ['privacy', 'RGPD : export et suppression des données'],
  ['app', 'Distribution de l’app Android'],
  ['admin', 'Administration (comptes listés dans ADMIN_EMAILS)'],
  ['monitoring', 'État du service, métriques, erreurs clientes'],
  ['health', 'Sondes de vie (plateforme)'],
];

const DESCRIPTION = `
API REST de l'application **Agenda G & N** (web et Android). Toutes les routes sont versionnées
sous \`/v1\`. Guide complet (authentification, erreurs, idempotence, temps réel) : page
*API → Guide* de la documentation.

- **Authentification** : \`Authorization: Bearer <accessToken>\` (Android, en-tête
  \`X-Client: mobile\` à la connexion pour recevoir les jetons dans le corps), ou cookies
  \`httpOnly\` posés par \`/v1/auth/login\` (web).
- **CSRF** : toute requête qui modifie (POST, PATCH, PUT, DELETE) doit porter
  \`${CSRF_HEADER}: agenda-gn\`.
- **Erreurs** : toujours \`{ "error": { "code", "message", "details"? } }\` ; le \`code\` est
  stable (voir le schéma \`ApiError\`), le \`message\` n'est destiné qu'aux développeurs.
- **Idempotence** : les créations de tâches acceptent \`Idempotency-Key\` (UUID) pour être
  rejouées sans doublon depuis une file hors ligne.
`.trim();

/**
 * Document OpenAPI complet : routes Nest + schémas Zod de @agenda/contracts (corps, paramètres de
 * requête, réponses) + résumés tirés des commentaires JSDoc des contrôleurs.
 */
export function buildOpenApi(
  app: INestApplication,
  srcDir = join(__dirname, '../../src'),
): OpenAPIObject {
  const source = readSourceInfo(srcDir);
  const used = new Set<string>(['ApiError']);
  decorateRoutes(app, source, used);

  const config = new DocumentBuilder()
    .setTitle('Agenda G & N — API')
    .setDescription(DESCRIPTION)
    .setVersion('1')
    .addServer('/', 'Même origine que le site (le web relaie /v1/* vers l’API)')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addCookieAuth('gn_at', { type: 'apiKey', in: 'cookie', name: 'gn_at' }, 'cookie');
  for (const [name, description] of TAGS) config.addTag(name, description);
  const document = SwaggerModule.createDocument(app, config.build());

  document.components = { ...document.components, schemas: componentSchemas(used) };
  completePaths(document);
  return document;
}

function decorateRoutes(app: INestApplication, source: SourceInfo, used: Set<string>): void {
  const modules = app.get(ModulesContainer);
  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => unknown) | null;
      if (!controller) continue;
      const proto = controller.prototype as Record<string, unknown>;
      const classPublic = Reflect.getMetadata(IS_PUBLIC, controller) === true;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        const handler = descriptor?.value as object | undefined;
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;

        const apply = (decorator: MethodDecorator) => decorator(proto, name, descriptor!);
        const info = source.get(controller.name)?.get(name);
        if (info?.summary)
          apply(
            ApiOperation({ summary: info.summary, description: info.description ?? undefined }),
          );

        const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {}) as Record<
          string,
          { data?: unknown; pipes?: unknown[] }
        >;
        for (const [key, arg] of Object.entries(args)) {
          const type = Number(key.split(':')[0]);
          const pipe = arg.pipes?.find((p): p is ZodPipe<ZodType> => p instanceof ZodPipe);
          if (!pipe) continue;
          if (type === RouteParamtypes.BODY) {
            apply(ApiBody({ schema: schemaFor(pipe.schema, 'input', used) }));
          } else if (type === RouteParamtypes.QUERY && arg.data === undefined) {
            const json = toJson(pipe.schema, 'input');
            const required = new Set((json.required as string[] | undefined) ?? []);
            for (const [prop, schema] of Object.entries(
              (json.properties ?? {}) as Record<string, JsonSchema>,
            )) {
              apply(
                ApiQuery({
                  name: prop,
                  required: required.has(prop),
                  schema,
                  description: schema.description as string | undefined,
                }),
              );
            }
          }
        }

        const status =
          (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined) ??
          (method === RequestMethod.POST ? 201 : 200);
        const response = responseSchema(info?.returnType ?? null, used);
        apply(
          ApiResponse({
            status,
            description: status === 204 ? 'Aucun contenu' : 'Succès',
            ...(response && status !== 204 ? { schema: response } : {}),
          }),
        );
        apply(
          ApiResponse({
            status: 'default',
            description: 'Erreur (code stable dans `error.code`)',
            schema: { $ref: `${REF}ApiError` },
          }),
        );

        const skipCsrf =
          Reflect.getMetadata(SKIP_CSRF, controller) === true ||
          Reflect.getMetadata(SKIP_CSRF, handler) === true;
        if (method !== RequestMethod.GET && method !== RequestMethod.HEAD && !skipCsrf) {
          apply(
            ApiHeader({
              name: CSRF_HEADER,
              required: true,
              description: 'Protection CSRF : valeur fixe.',
              schema: { type: 'string', enum: [CSRF_HEADER_VALUE] },
            }),
          );
        }
        const interceptors = (Reflect.getMetadata(INTERCEPTORS_METADATA, handler) ??
          []) as unknown[];
        if (interceptors.includes(IdempotencyInterceptor)) {
          apply(
            ApiHeader({
              name: 'Idempotency-Key',
              required: false,
              description: 'UUID choisi par le client : rejouer la requête ne crée pas de doublon.',
              schema: { type: 'string', format: 'uuid' },
            }),
          );
        }

        const isPublic = classPublic || Reflect.getMetadata(IS_PUBLIC, handler) === true;
        Reflect.defineMetadata(
          'swagger/apiSecurity',
          isPublic ? [] : [{ bearer: [] }, { cookie: [] }],
          handler,
        );
      }
    }
  }
}

/** `Promise<OccurrenceDto[]>` → `$ref` (tableau) si le type est un schéma de @agenda/contracts. */
function responseSchema(returnType: string | null, used: Set<string>): JsonSchema | null {
  if (!returnType) return null;
  const inner = /^Promise<(.+)>$/.exec(returnType)?.[1] ?? returnType;
  const match = /^([A-Za-z]\w*)(\[\])?$/.exec(inner.trim());
  if (!match) return null;
  const schema = (contracts as Record<string, unknown>)[match[1]!];
  if (!(schema instanceof z.ZodType)) return null;
  used.add(match[1]!);
  const ref = { $ref: `${REF}${match[1]}` };
  return match[2] ? { type: 'array', items: ref } : ref;
}

function schemaFor(schema: ZodType, io: 'input' | 'output', used: Set<string>): JsonSchema {
  const name = namedSchemas.get(schema);
  if (!name) return toJson(schema, io);
  used.add(name);
  return { $ref: `${REF}${name}` };
}

function toJson(schema: ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as JsonSchema;
  delete json.$schema;
  return simplify(json) as JsonSchema;
}

/** Retire l'expression régulière que Zod joint à `format: uuid` (illisible, redondante). */
function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify);
  if (typeof node !== 'object' || node === null) return node;
  const obj = Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, simplify(v)]),
  ) as JsonSchema;
  if (obj.format === 'uuid') delete obj.pattern;
  // Dates « AAAA-MM-JJ » : format standard (exemples lisibles) plutôt que l'expression régulière.
  if (obj.pattern === '^\\d{4}-\\d{2}-\\d{2}$') {
    delete obj.pattern;
    obj.format = 'date';
  }
  return obj;
}

const API_ERROR: JsonSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', enum: Object.values(contracts.ErrorCode) },
        message: { type: 'string', description: 'Message technique (anglais), jamais affiché.' },
        details: { description: 'Détail éventuel (champs invalides pour VALIDATION_FAILED).' },
      },
    },
  },
};

/** Schémas nommés référencés ; les `$defs` internes de Zod sont remontés dans les composants. */
function componentSchemas(used: Set<string>): Record<string, JsonSchema> {
  const out: Record<string, JsonSchema> = { ApiError: API_ERROR };
  for (const name of [...used].sort()) {
    if (name === 'ApiError') continue;
    const schema = (contracts as Record<string, unknown>)[name] as ZodType;
    // Les réponses (…Dto) décrivent ce que l'API renvoie ; le reste, ce qu'elle accepte.
    const json = toJson(schema, /Dto$|Response$|Preview|Item$/.test(name) ? 'output' : 'input');
    const defs = (json.$defs ?? {}) as Record<string, JsonSchema>;
    delete json.$defs;
    let text = JSON.stringify(json);
    for (const def of Object.keys(defs)) {
      out[`${name}_${def}`] = defs[def]!;
      text = text.replaceAll(`"#/$defs/${def}"`, `"${REF}${name}_${def}"`);
    }
    out[name] = JSON.parse(text) as JsonSchema;
  }
  return out;
}

/**
 * Paramètres de chemin portés par le contrôleur (`households/:householdId`) mais lus par un
 * garde plutôt que par `@Param` : déclarés pour que le document reste valide.
 */
function completePaths(document: OpenAPIObject): void {
  for (const [path, item] of Object.entries(document.paths)) {
    const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    for (const op of Object.values(item) as { parameters?: { name: string; in: string }[] }[]) {
      if (typeof op !== 'object' || op === null || !('responses' in op)) continue;
      // Route publique : déclarée explicitement sans authentification.
      (op as { security?: unknown[] }).security ??= [];
      op.parameters ??= [];
      for (const name of names) {
        if (op.parameters.some((p) => p.in === 'path' && p.name === name)) continue;
        op.parameters.unshift({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        } as never);
      }
    }
  }
}
