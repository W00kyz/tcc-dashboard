import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { psql } from "./stack";
import { SEED_USERS } from "./users";

const SWEEP_SQL = resolve("e2e/support/cleanup.sql");
// When the current run started, by the database clock. Rows the run writes about seed data
// (audit entries, seed-account sign-ins) carry no E2E marker: this window is how they are found.
// Left behind by an interrupted run, it lets the next run's setup clean that run up too.
const RUN_STARTED_AT_FILE = resolve("e2e/.auth/run-started-at");
// The settings row and the alert rules as they were before the run, as JSON. The run edits both
// through the API (serviceDay.ts, the alert-rules spec); the sweep writes them back verbatim, so
// even who-changed-it-when ends the run as it started. Left behind by an interrupted run, it is
// what the next run's setup restores.
const SEED_ROWS_FILE = resolve("e2e/.auth/seed-rows.json");

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
+ (SELECT count(*) FROM users WHERE name LIKE 'E2E %' OR email LIKE 'e2e-%');`;

function runStartedAt(): string {
  return existsSync(RUN_STARTED_AT_FILE)
    ? readFileSync(RUN_STARTED_AT_FILE, "utf8").trim()
    : "infinity";
}

interface SeedRows {
  settings: string;
  alertRules: string;
}

// Dollar-quoted, so the JSON goes in as it came out (quotes, backslashes and all).
function literal(json: string): string {
  return `$e2e$${json}$e2e$`;
}

/** The settings singleton and the alert rules back exactly as `markRunStart` read them. Neither
 * table is referenced by any other, so the rows are simply replaced. */
function restoreSeedRows(): void {
  if (!existsSync(SEED_ROWS_FILE)) {
    return;
  }
  const rows = JSON.parse(readFileSync(SEED_ROWS_FILE, "utf8")) as SeedRows;
  psql(`\\set ON_ERROR_STOP on
BEGIN;
DELETE FROM system_settings;
INSERT INTO system_settings
  SELECT * FROM json_populate_record(NULL::system_settings, ${literal(rows.settings)});
DELETE FROM alert_rules;
INSERT INTO alert_rules
  SELECT * FROM json_populate_recordset(NULL::alert_rules, ${literal(rows.alertRules)});
COMMIT;`);
}

/** Deletes every record the e2e suite created (see cleanup.sql), puts the settings and alert
 * rules back as they were, and returns psql's report.
 * @example sweepE2eRecords(); expect(countE2eLeftovers()).toBe(0); */
export function sweepE2eRecords(): string {
  // The window goes in as a psql variable (cleanup.sql reads :'run_started_at'); with no run on
  // record, "infinity" matches no row.
  const report = psql(readFileSync(SWEEP_SQL, "utf8"), [
    "-v",
    `run_started_at='${runStartedAt()}'`,
  ]);
  restoreSeedRows();

  return report;
}

/** Records, by the database clock, that a run starts now, and the settings and alert rules it
 * starts from. Call before the first sign-in. */
export function markRunStart(): void {
  const rows: SeedRows = {
    settings: psql("SELECT row_to_json(s) FROM system_settings s;", ["-tA"]).trim(),
    alertRules: psql("SELECT json_agg(r) FROM alert_rules r;", ["-tA"]).trim(),
  };
  refuseWidenedSettings(rows.settings);
  writeFileSync(RUN_STARTED_AT_FILE, psql("SELECT now();", ["-tA"]).trim());
  writeFileSync(SEED_ROWS_FILE, JSON.stringify(rows));
}

/** The run widens the settings to a service day all week (serviceDay.ts). Finding them already
 * widened means a killed run's snapshot was lost (e2e/.auth cleaned): taking them as the
 * starting point would make the widening permanent, so stop and say how to recover. */
function refuseWidenedSettings(settingsJson: string): void {
  const settings = JSON.parse(settingsJson) as {
    service_weekdays: number[];
    workday_end_time: string;
  };
  if (settings.service_weekdays.length === 7 && settings.workday_end_time === "23:59:59") {
    throw new Error(
      `system_settings already has service_weekdays=${JSON.stringify(settings.service_weekdays)} ` +
        `and workday_end_time="${settings.workday_end_time}", the e2e run's own service day: ` +
        "a killed run left them and its snapshot is gone. Put the real values back in " +
        "Configurações (default Mon–Fri, 17:00) and run again.",
    );
  }
}

/** The run is fully swept: forget its window and its starting rows. */
export function clearRunStart(): void {
  rmSync(RUN_STARTED_AT_FILE, { force: true });
  rmSync(SEED_ROWS_FILE, { force: true });
}

/** Rows the run wrote about seed data that are still there (expected 0 after a sweep). */
export function countRunTraces(): number {
  const since = runStartedAt();

  return Number(
    psql(
      `SELECT (SELECT count(*) FROM audit_trail WHERE created_at >= '${since}'::timestamptz
                 AND entity_type IN ('alert_rule', 'personal_data', 'system_settings'))
            + (SELECT count(*) FROM auth_logs WHERE created_at >= '${since}'::timestamptz
                 AND attempted_email IN (${SEED_EMAILS}))
            + (SELECT count(*) FROM consent_records WHERE created_at >= '${since}'::timestamptz
                 AND user_id IN (SELECT id FROM users WHERE email IN (${SEED_EMAILS})));`,
      ["-tA"],
    ).trim(),
  );
}

/** How many E2E-marked records are still in the database. */
export function countE2eLeftovers(): number {
  return Number(psql(LEFTOVER_COUNT_SQL, ["-tA"]).trim());
}
