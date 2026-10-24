import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// The suite runs from the dashboard folder against the stack started by infra/scripts/dev-up.sh.
const COMPOSE_FILE = process.env.E2E_COMPOSE_FILE ?? resolve("../infra/docker-compose.yml");

/** Runs a command inside one service of the dev stack and returns its stdout. */
function composeExec(service: string, command: string[], input?: string): string {
  return execFileSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "exec", "-T", service, ...command],
    {
      input,
      encoding: "utf8",
      // uv's "Bytecode compiled" chatter is not the suite's business; a failure still throws
      // with stderr attached.
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

/** Runs `sql` (stdin) with psql in the postgres container, which reads the role and database
 * from its own environment, so no credential is repeated here.
 * @example psql("SELECT now();", ["-tA"]) */
export function psql(sql: string, extraArgs: string[] = []): string {
  return composeExec(
    "postgres",
    ["sh", "-c", `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" ${extraArgs.join(" ")}`],
    sql,
  );
}

/** One pass of the release scan now, as the backend's scheduler runs it every minute
 * (backend app/scripts/run_release_scan.py): a spec does not wait for the next minute. */
export function runReleaseScan(): string {
  return composeExec("backend", ["uv", "run", "python", "-m", "app.scripts.run_release_scan"]);
}
