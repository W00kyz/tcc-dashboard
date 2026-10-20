import { createHash, randomUUID } from "node:crypto";

import { campusToday, SeedApi, uniqueSuffix } from "./api";

/**
 * Field activity the board shows (a started route, a GPS fix, a check-in awaiting review),
 * produced through the same API the mobile app calls. Specs arrange their own instead of
 * hoping the dev database already holds some: an empty database used to skip them silently.
 * Everything hangs off an E2E site, so the suite's sweep removes it (support/cleanup.sql).
 */

// Inside the E2E site outline (support/api.ts E2E_SITE_OUTLINE), next to its first point.
const SITE_SPOT = { latitude: -7.2147, longitude: -35.9094 };
const SEED_WORKER = "João da Silva";

export interface StartedRoute {
  routeId: string;
  floorId: string;
  pointName: string;
  building: { id: string; name: string };
}

/** A route for today on a new E2E site, assigned to the seed field worker (the one account the
 * suite can sign in as on the app side) and started by him. */
export async function startedRouteForSeedWorker(): Promise<StartedRoute> {
  const manager = await SeedApi.signIn("manager");
  const site = await manager.createSite(uniqueSuffix(), 1);
  const worker = await manager.fieldWorkerNamed(SEED_WORKER);
  const route = await manager.createRoute(worker.id, campusToday(), [site.points[0]?.id ?? ""]);
  await manager.dispose();

  const app = await SeedApi.signIn("fieldWorker");
  await app.post(`/routes/${route.id}/start`, {
    ...SITE_SPOT,
    started_at: new Date().toISOString(),
  });
  await app.dispose();

  return {
    routeId: route.id,
    floorId: site.floor.id,
    pointName: site.points[0]?.name ?? "",
    building: site.building,
  };
}

/** A GPS fix from the seed field worker on a started route, so the board has a position. */
export async function reportedWorkerPosition(): Promise<void> {
  const { routeId } = await startedRouteForSeedWorker();
  const app = await SeedApi.signIn("fieldWorker");
  await app.post("/worker-positions", {
    route_id: routeId,
    ...SITE_SPOT,
    reported_at: new Date().toISOString(),
  });
  await app.dispose();
}

/** A check-in without GPS: the backend flags it GPS_UNAVAILABLE and queues it for review.
 * Returns the started route (and its building) it happened on. */
export async function executionAwaitingReview(): Promise<StartedRoute> {
  const started = await startedRouteForSeedWorker();
  const { floorId } = started;
  const manager = await SeedApi.signIn("manager");
  const qr = await manager.post<{ public_code: string }>(`/floors/${floorId}/qr-codes`, {
    reason: "E2E: fila de revisão",
  });
  await manager.dispose();

  const app = await SeedApi.signIn("fieldWorker");
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

/** An E2E service type whose form has one published MEDIA question; returns its ids. */
async function publishedMediaForm(manager: SeedApi, prompt: string) {
  const serviceType = await manager.post<{ id: string }>("/service-types", {
    name: `E2E Tipo foto ${uniqueSuffix()}`,
    average_duration_minutes: 30,
  });
  const form = await manager.get<{ form_id: string }>(`/service-types/${serviceType.id}/form`);
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
    serviceTypeId: serviceType.id,
    formVersionId: version.form_version_id,
    stableKey: version.questions[0]?.stable_key ?? "",
  };
}

/**
 * A finished execution whose MEDIA answer lists two photos: one uploaded, one that never
 * arrived (its upload still queued on the phone). The check-out is accepted anyway (Ruling 6).
 */
export async function executionWithMediaAnswer(prompt: string): Promise<MediaExecution> {
  const manager = await SeedApi.signIn("manager");
  const form = await publishedMediaForm(manager, prompt);
  const site = await manager.createSite(uniqueSuffix(), 1);
  const point = site.points[0]?.id ?? "";
  const worker = await manager.fieldWorkerNamed(SEED_WORKER);
  const route = await manager.post<{ id: string }>("/routes", {
    field_worker_id: worker.id,
    route_date: campusToday(),
    route_type: "REGULAR",
    stops: [{ service_point_id: point, service_type_id: form.serviceTypeId }],
  });
  const qr = await manager.post<{ public_code: string }>(`/floors/${site.floor.id}/qr-codes`, {
    reason: "E2E: pergunta de mídia",
  });
  await manager.dispose();

  const app = await SeedApi.signIn("fieldWorker");
  const now = () => new Date().toISOString();
  await app.post(`/routes/${route.id}/start`, { ...SITE_SPOT, started_at: now() });
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
