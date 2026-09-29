#!/bin/sh
# Production entrypoint: apply DB migrations, then start the server.
set -e
cd /app/server

if [ "${DB_PROVIDER:-postgresql}" = "postgresql" ]; then
  echo "[entrypoint] preparing Postgres schema…"
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
  npx prisma generate
  # Prisma Migrate cannot run through a transaction-mode connection pooler
  # (e.g. Neon's pooled endpoint) — DDL fails with an empty "Schema engine
  # error". Run migrations against a direct connection instead:
  # DIRECT_DATABASE_URL wins when set; otherwise a Neon "-pooler" hostname
  # is automatically de-pooled. The app itself keeps using DATABASE_URL.
  MIGRATION_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"
  case "$MIGRATION_URL" in
    *@*-pooler.*)
      MIGRATION_URL="$(printf '%s' "$MIGRATION_URL" | sed -E 's#(://[^/@]+@[^/]*)-pooler\.#\1.#')"
      echo "[entrypoint] using direct database connection for migrations…"
      ;;
  esac
  echo "[entrypoint] applying migrations…"
  DATABASE_URL="$MIGRATION_URL" npx prisma migrate deploy
else
  echo "[entrypoint] using SQLite (DB_PROVIDER=${DB_PROVIDER})…"
  npx prisma db push
fi

echo "[entrypoint] starting Consistency Guard…"
exec node dist/index.js
