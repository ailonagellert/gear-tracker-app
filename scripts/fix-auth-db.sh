#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.local"

cd "$APP_DIR"

echo "[1/5] Ensuring DATABASE_URL is pinned to /app/data/dev.db in .env.local"
if [ -f "$ENV_FILE" ]; then
  if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    # Replace existing DATABASE_URL line
    sed -i 's#^DATABASE_URL=.*#DATABASE_URL="file:/app/data/dev.db"#' "$ENV_FILE"
  else
    printf '\nDATABASE_URL="file:/app/data/dev.db"\n' >> "$ENV_FILE"
  fi
else
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

echo "[2/5] Rebuilding container"
docker compose up -d --build

echo "[3/5] Applying Prisma schema to runtime DB"
docker compose exec app sh -lc 'npx prisma db push --schema /app/prisma/schema.prisma'

echo "[4/5] Generating Prisma client in container"
docker compose exec app sh -lc 'npx prisma generate --schema /app/prisma/schema.prisma'

echo "[5/5] Restarting app container"
docker compose restart app

echo "Done. Current DATABASE_URL inside container:"
docker compose exec app sh -lc 'echo $DATABASE_URL'
