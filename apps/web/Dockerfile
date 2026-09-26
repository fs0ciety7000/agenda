# Image du web Next.js (sortie standalone). Contexte de build : racine du monorepo.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Mode non interactif pour pnpm.
ENV CI=true
# URL de l'API vue DEPUIS le conteneur web : les rewrites /v1/* sont figés au build.
ARG API_URL=http://api:4000
ENV API_URL=${API_URL} NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=@agenda/web

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# Fichiers statiques (logo, icônes PWA) : la sortie standalone ne les inclut pas.
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
