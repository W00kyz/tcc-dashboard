#!/usr/bin/env bash
# Prints one line per table of the dev database: name, row count and an md5 of every row (sorted
# as text). Two snapshots that diff clean mean the database is identical — the e2e suite's
# promise ("o banco termina a execução como começou"). See CONTRIBUTING.md, "Testes end-to-end".
#
#   e2e/support/db-snapshot.sh > antes.txt && npm run test:e2e && \
#     e2e/support/db-snapshot.sh | diff antes.txt -
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${E2E_COMPOSE_FILE:-$SCRIPT_DIR/../../../infra/docker-compose.yml}"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -q' <<'SQL'
CREATE TEMP TABLE snapshot (table_name text, row_count bigint, rows_md5 text);
DO $$
DECLARE name text; total bigint; digest text;
BEGIN
  FOR name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'
  LOOP
    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(t::text, E''\n'' ORDER BY t::text), '''')) '
      'FROM %I t', name)
      INTO total, digest;
    INSERT INTO snapshot VALUES (name, total, digest);
  END LOOP;
END $$;
SELECT table_name || ' ' || row_count || ' ' || rows_md5 FROM snapshot ORDER BY table_name;
SQL
