# Site vitrine (Next.js exporté en pages statiques, servies par nginx).
# Contexte de build : racine du monorepo (design tokens partagés avec le site web).

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
ENV CI=true NEXT_TELEMETRY_DISABLED=1
# Adresses publiques, figées au build (liens, balises Open Graph, plan du site).
ARG SITE_URL=https://decouvrir.tandem-agenda.app
ARG APP_URL=https://tandem-agenda.app
ARG DOCS_URL=https://docs.tandem-agenda.app
ARG PLAY_URL=
ARG CONTACT_EMAIL=
ENV NEXT_PUBLIC_SITE_URL=$SITE_URL NEXT_PUBLIC_APP_URL=$APP_URL NEXT_PUBLIC_DOCS_URL=$DOCS_URL \
    NEXT_PUBLIC_PLAY_URL=$PLAY_URL NEXT_PUBLIC_CONTACT_EMAIL=$CONTACT_EMAIL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=@agenda/site

FROM nginx:1.29-alpine AS runtime
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/site/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
