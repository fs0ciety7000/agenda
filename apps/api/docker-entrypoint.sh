#!/bin/sh
# Applique les migrations en attente puis démarre l'API.
# `prisma migrate deploy` est idempotent et n'applique que les migrations versionnées (jamais de reset).
set -e
node_modules/.bin/prisma migrate deploy
exec node dist/main.js
