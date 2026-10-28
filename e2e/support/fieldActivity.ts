import { createHash, randomUUID } from "node:crypto";

import { registerWorker, type RegisteredWorker, SeedApi, uniqueSuffix } from "./api";
import { psql, runReleaseScan } from "./stack";

/**
 * Field activity the board shows (a started route, a check-in awaiting review), produced through
 * the same API the mobile app calls. Specs arrange their own instead of hoping the dev database
 * already holds some: an empty database used to skip them silently. Everything hangs off an E2E
 * site, company and worker, so the suite's sweep removes it (support/cleanup.sql).
 */

// Inside the E2E site outline (support/api.ts E2E_SITE_OUTLINE), next to its first point, and
// inside the default campus rectangle: the allocation refuses a start outside the campus.
export const SITE_SPOT = { latitude: -7.2147, longitude: -35.9094 };

export interface StartedRoute {
  routeId: string;
  floorId: string;
  pointName: string;
  building: { id: string; name: string };
  worker: RegisteredWorker;
}

/** A worker who registered for `companyId` in the app and was approved by the manager. */
export async function approvedWorker(
  manager: SeedApi,
  suffix: string,
  companyId: string,
): Promise<RegisteredWorker> {
  const worker = await registerWorker(suffix, companyId);
  await manager.approveWorker(worker.fullName);

  return worker;
}

/** "Iniciar rota" from the app, standing at the E2E site: the allocation hands the worker the
 * nearest free points of their company's types. Returns the route id. */
export async function startRoute(worker: RegisteredWorker): Promise<string> {
  const app = await SeedApi.signInAs(worker.email, worker.password);
  const started = await app.post<{ route: { id: string } }>("/routes/start", {
    ...SITE_SPOT,
    captured_at: new Date().toISOString(),
  });
  await app.dispose();

  return started.route.id;
}

/** A new E2E site with one point, typed for a new E2E company, and an approved worker of that
 * company who started their route there — the allocation hands them exactly that point. */
export async function startedRouteOnNewSite(): Promise<StartedRoute> {
  const suffix = uniqueSuffix();
  const manager = await SeedApi.signIn("manager");
  const site = await manager.createSite(suffix, 1);
  const worker = await approvedWorker(manager, suffix, site.company?.id ?? "");
  await manager.dispose();

  return {
    routeId: await startRoute(worker),
    floorId: site.floor.id,
    pointName: site.points[0]?.name ?? "",
    building: site.building,
    worker,
  };
}

/** A check-in without GPS: the backend flags it GPS_UNAVAILABLE and queues it for review.
 * Returns the started route (and its building) it happened on. */
export async function executionAwaitingReview(): Promise<StartedRoute> {
  const started = await startedRouteOnNewSite();
  const { floorId } = started;
  const manager = await SeedApi.signIn("manager");
  const qr = await manager.post<{ public_code: string }>(`/floors/${floorId}/qr-codes`, {
    reason: "E2E: fila de revisão",
  });
  await manager.dispose();

  const app = await SeedApi.signInAs(started.worker.email, started.worker.password);
  await app.post("/check-ins", {
    qr_payload: qr.public_code,
    scanned_at: new Date().toISOString(),
    idempotency_key: randomUUID(),
  });
  await app.dispose();

  return started;
}

/** A GPS fix from `started`'s worker at the E2E site, so the board has a position for them. */
export async function reportedPosition(started: StartedRoute): Promise<void> {
  const app = await SeedApi.signInAs(started.worker.email, started.worker.password);
  await app.post("/worker-positions", {
    route_id: started.routeId,
    ...SITE_SPOT,
    reported_at: new Date().toISOString(),
  });
  await app.dispose();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Makes `routeId`'s worker look silent for `minutes`, past `location_silence_release_minutes`
 * (45 by default), then runs the release scan once: the batch goes back to the pool for
 * LOCATION_SILENCE, which the worker can appeal. The worker's last sign of life is the batch
 * handout (no position, no scan was sent), so moving it back is the whole of the silence; the
 * scan judges against the real clock, so nothing else on the stack is aged with it.
 * WARNING: in the first 46 min after midnight (campus) this moves `started_at` into the previous
 * day; the route keeps today's `route_date`, so the release still happens.
 */
export function releaseForSilence(routeId: string, minutes = 46): void {
  if (!UUID.test(routeId)) {
    throw new Error(`releaseForSilence: route id "${routeId}" is not a UUID.`);
  }
  psql(`\\set ON_ERROR_STOP on
UPDATE routes
   SET last_allocated_at = last_allocated_at - interval '${String(minutes)} minutes',
       started_at = started_at - interval '${String(minutes)} minutes'
 WHERE id = '${routeId}';`);
  runReleaseScan();
}

// A 1x1 JPEG: the evidence endpoint only accepts JPEG bytes, and the drawer decodes them.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);

export interface FinishedExecution extends StartedRoute {
  executionId: string;
  complaints: string;
}

/** A worker's whole visit, through the API the app calls: check-in at a new E2E site's point,
 * two photos, then check-out carrying `complaints` as the free text. */
export async function finishedExecutionWithEvidence(
  complaints = "E2E: torneira da pia vazando\nE2E: faltou papel toalha",
): Promise<FinishedExecution> {
  const started = await startedRouteOnNewSite();
  const manager = await SeedApi.signIn("manager");
  const qr = await manager.post<{ public_code: string }>(`/floors/${started.floorId}/qr-codes`, {
    reason: "E2E: evidências",
  });
  await manager.dispose();

  const app = await SeedApi.signInAs(started.worker.email, started.worker.password);
  const checkIn = await app.post<{ execution_id: string }>("/check-ins", {
    qr_payload: qr.public_code,
    scanned_at: new Date().toISOString(),
    idempotency_key: randomUUID(),
  });
  for (let photo = 0; photo < 2; photo += 1) {
    await app.postMultipart(`/executions/${checkIn.execution_id}/evidence/photo`, {
      file: { name: "e2e.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG },
      sha256: createHash("sha256").update(TINY_JPEG).digest("hex"),
      captured_at: new Date().toISOString(),
      idempotency_key: randomUUID(),
    });
  }
  await app.post("/check-outs", {
    qr_payload: qr.public_code,
    scanned_at: new Date().toISOString(),
    checkout_idempotency_key: randomUUID(),
    complaints_suggestions: complaints,
  });
  await app.dispose();

  return { ...started, executionId: checkIn.execution_id, complaints };
}
