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

// A real 1×1 JPEG: the evidence endpoint only accepts JPEG bytes.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////" +
    "////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAA" +
    "AAAAAP/aAAgBAQABPxA=",
  "base64",
);

interface MediaExecution {
  servicePointId: string;
  arrivedKey: string;
  missingKey: string;
}

/** The form of `serviceTypeId` with one MEDIA question, published; returns its ids. */
async function publishedMediaForm(manager: SeedApi, serviceTypeId: string, prompt: string) {
  const form = await manager.get<{ form_id: string }>(`/service-types/${serviceTypeId}/form`);
  await manager.post(`/forms/${form.form_id}/draft/questions`, {
    prompt,
    question_type: "MEDIA",
    required: true,
    options: [],
  });
  const version = await manager.post<{
    form_version_id: string;
    questions: { stable_key: string }[];
  }>(`/forms/${form.form_id}/publish`, {});

  return {
    formVersionId: version.form_version_id,
    stableKey: version.questions[0]?.stable_key ?? "",
  };
}

/**
 * A finished execution whose MEDIA answer lists two photos: one uploaded, one that never
 * arrived (its upload still queued on the phone). The check-out is accepted anyway (Ruling 6).
 */
export async function executionWithMediaAnswer(prompt: string): Promise<MediaExecution> {
  const suffix = uniqueSuffix();
  const manager = await SeedApi.signIn("manager");
  const site = await manager.createSite(suffix, 1);
  const form = await publishedMediaForm(manager, site.company?.serviceType.id ?? "", prompt);
  const point = site.points[0]?.id ?? "";
  const worker = await approvedWorker(manager, suffix, site.company?.id ?? "");
  const qr = await manager.post<{ public_code: string }>(`/floors/${site.floor.id}/qr-codes`, {
    reason: "E2E: pergunta de mídia",
  });
  await manager.dispose();

  await startRoute(worker);
  const app = await SeedApi.signInAs(worker.email, worker.password);
  const now = () => new Date().toISOString();
  const checkIn = await app.post<{ execution_id: string }>("/check-ins", {
    qr_payload: qr.public_code,
    ...SITE_SPOT,
    scanned_at: now(),
    idempotency_key: randomUUID(),
  });
  const [arrivedKey, missingKey] = [randomUUID(), randomUUID()];
  await app.postMultipart(`/executions/${checkIn.execution_id}/evidence/photo`, {
    file: { name: "foto.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG },
    sha256: createHash("sha256").update(TINY_JPEG).digest("hex"),
    captured_at: now(),
    idempotency_key: arrivedKey,
  });
  await app.post("/check-outs", {
    qr_payload: qr.public_code,
    ...SITE_SPOT,
    scanned_at: now(),
    checkout_idempotency_key: randomUUID(),
    form_version_id: form.formVersionId,
    answers: [{ stable_key: form.stableKey, value: [arrivedKey, missingKey] }],
  });
  await app.dispose();

  return { servicePointId: point, arrivedKey, missingKey };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Makes `routeId`'s worker look silent for `minutes`, past `location_silence_release_minutes`
 * (45 by default), then runs the release scan once: the batch goes back to the pool for
 * LOCATION_SILENCE, which the worker can appeal. The worker's last sign of life is the batch
 * handout (no position, no scan was sent), so moving it back is the whole of the silence; the
 * scan judges against the real clock, so nothing else on the stack is aged with it.
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
