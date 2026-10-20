import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SEED_USERS } from "./users";

// The suite runs from the dashboard folder against the stack started by infra/scripts/dev-up.sh.
const COMPOSE_FILE = process.env.E2E_COMPOSE_FILE ?? resolve("../infra/docker-compose.yml");
const SWEEP_SQL = resolve("e2e/support/cleanup.sql");
// When the current run started, by the database clock. Rows the run writes about seed data
// (audit entries, seed-account sign-ins) carry no E2E marker: this window is how they are found.
// Left behind by an interrupted run, it lets the next run's setup clean that run up too.
const RUN_STARTED_AT_FILE = resolve("e2e/.auth/run-started-at");

const SEED_EMAILS = Object.values(SEED_USERS)
  .map((email) => `'${email}'`)
  .join(", ");

// Records that carry the E2E marker themselves; anything hanging off them goes with them.
const LEFTOVER_COUNT_SQL = `SELECT
  (SELECT count(*) FROM buildings WHERE name LIKE 'E2E %')
+ (SELECT count(*) FROM service_points WHERE name LIKE 'E2E %')
+ (SELECT count(*) FROM field_workers WHERE full_name LIKE 'E2E %')
+ (SELECT count(*) FROM contractor_companies WHERE name LIKE 'E2E %')
+ (SELECT count(*) FROM service_types WHERE name LIKE 'E2E %')
+ (SELECT count(*) FROM route_templates WHERE name LIKE 'E2E %')
+ (SELECT count(*) FROM users WHERE name LIKE 'E2E %' OR email LIKE 'e2e-%');`;

// psql inside the postgres container reads the role and database from the container's own
// environment, so no credential is repeated here.
function psql(sql: string, extraArgs: string[] = []): string {
  // The window goes in as a psql variable (cleanup.sql reads :'run_started_at'); with no run on
  // record, "infinity" matches no row.
  return execFileSync(
    "docker",
    [
      "compose",
      "-f",
      COMPOSE_FILE,
      "exec",
      "-T",
      "postgres",
      "sh",
      "-c",
      `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" ${extraArgs.join(" ")}`,
    ],
    { input: sql, encoding: "utf8" },
  );
}

function runStartedAt(): string {
  return existsSync(RUN_STARTED_AT_FILE)
    ? readFileSync(RUN_STARTED_AT_FILE, "utf8").trim()
    : "infinity";
}

/** Deletes every record the e2e suite created (see cleanup.sql) and returns psql's report.
 * @example sweepE2eRecords(); expect(countE2eLeftovers()).toBe(0); */
export function sweepE2eRecords(): string {
  return psql(readFileSync(SWEEP_SQL, "utf8"), ["-v", `run_started_at='${runStartedAt()}'`]);
}

/** Records, by the database clock, that a run starts now. Call before the first sign-in. */
export function markRunStart(): void {
  writeFileSync(RUN_STARTED_AT_FILE, psql("SELECT now();", ["-tA"]).trim());
}

/** The run is fully swept: forget its window. */
export function clearRunStart(): void {
  rmSync(RUN_STARTED_AT_FILE, { force: true });
}

/** Rows the run wrote about seed data that are still there (expected 0 after a sweep). */
export function countRunTraces(): number {
  const since = runStartedAt();

  return Number(
    psql(
      `SELECT (SELECT count(*) FROM audit_trail WHERE created_at >= '${since}'::timestamptz
                 AND entity_type IN ('alert_rule', 'personal_data'))
            + (SELECT count(*) FROM auth_logs WHERE created_at >= '${since}'::timestamptz
                 AND attempted_email IN (${SEED_EMAILS}));`,
      ["-tA"],
    ).trim(),
  );
}

/** How many E2E-marked records are still in the database. */
export function countE2eLeftovers(): number {
  return Number(psql(LEFTOVER_COUNT_SQL, ["-tA"]).trim());
}
