# Image de l'API NestJS. Contexte de build : racine du monorepo.

FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

FROM base AS build
# Mode non interactif pour pnpm.
ENV CI=true
# Couche de dépendances mise en cache tant que le lockfile ne change pas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=@agenda/api
# Dossier autonome : dist + node_modules de production (workspace inclus) + client Prisma.
RUN pnpm --filter @agenda/api deploy --prod --legacy /out \
 && cd /out && node_modules/.bin/prisma generate

FROM node:22-alpine AS runtime
# Tesseract : lecture des photos de tickets sur le serveur (français, néerlandais, anglais).
RUN apk add --no-cache openssl tini tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-fra tesseract-ocr-data-nld
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--", "sh", "docker-entrypoint.sh"]
