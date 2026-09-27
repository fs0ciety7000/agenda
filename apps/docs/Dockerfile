# Site de documentation (Docusaurus → fichiers statiques servis par nginx).
# Contexte de build : racine du dépôt (le contenu vient de docs/).

FROM node:22-alpine AS build
WORKDIR /repo/apps/docs
# Couche de dépendances mise en cache tant que le lockfile ne change pas.
COPY apps/docs/package.json apps/docs/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY docs /repo/docs
COPY apps/docs ./
# Adresses publiques (liens, plan du site), figées au build.
ARG DOCS_URL=https://agenda-docs.fs0ciety.org
ARG APP_URL=https://agenda.fs0ciety.org
ENV DOCS_URL=$DOCS_URL APP_URL=$APP_URL
RUN npm run build

FROM nginx:1.29-alpine AS runtime
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/build /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
