import { type APIRequestContext, expect, request } from "@playwright/test";

import { SEED_PASSWORD, SEED_USERS, type SeedRole } from "./users";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

interface MultipartFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

interface Named {
  id: string;
  name: string;
}

/** A small rectangle on campus around the points `createSite` places. */
export const E2E_SITE_OUTLINE = {
  type: "Polygon",
  coordinates: [
    [
      [-35.9097, -7.2144],
      [-35.9091, -7.2144],
      [-35.9091, -7.216],
      [-35.9097, -7.216],
      [-35.9097, -7.2144],
    ],
  ],
};

/** Short unique suffix so every spec run creates its own records instead of leaning on
 * whatever happens to be in the dev database. */
export function uniqueSuffix(): string {
  return Date.now().toString(36).slice(-6);
}

/** The local calendar date the dashboard calls "today" (browser runs in America/Fortaleza). */
export function campusToday(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);

  return now.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
}

/** Campus wall-clock "HH:MM" `minutesAhead` from now — the form the route builder sends an
 * arrival window in (wall-clock tagged UTC, see backend app/core/campus_clock.py). */
export function campusClockIn(minutesAhead: number): string {
  return new Date(Date.now() + minutesAhead * 60_000).toLocaleTimeString("en-GB", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Thin client over the backend for arranging test data. Specs exercise the UI; this only sets
 * the stage. @example const api = await SeedApi.signIn("manager");
 */
export class SeedApi {
  private constructor(private readonly context: APIRequestContext) {}

  static async signIn(role: SeedRole = "manager"): Promise<SeedApi> {
    const anonymous = await request.newContext({ baseURL: API_URL });
    const login = await anonymous.post("/auth/login", {
      data: { email: SEED_USERS[role], password: SEED_PASSWORD },
    });
    expect(login.ok(), `login as ${role} failed with ${String(login.status())}`).toBeTruthy();
    const { access_token: token } = (await login.json()) as { access_token: string };
    await anonymous.dispose();

    return new SeedApi(
      await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.context.get(path);
    expect(response.ok(), `GET ${path} -> ${String(response.status())}`).toBeTruthy();

    return (await response.json()) as T;
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const response = await this.context.post(path, { data });
    expect(
      response.ok(),
      `POST ${path} -> ${String(response.status())} ${await response.text()}`,
    ).toBeTruthy();

    return (await response.json()) as T;
  }

  /** A multipart form upload (the evidence photo endpoint). */
  async postMultipart<T>(
    path: string,
    multipart: Record<string, string | MultipartFile>,
  ): Promise<T> {
    const response = await this.context.post(path, { multipart });
    expect(
      response.ok(),
      `POST ${path} -> ${String(response.status())} ${await response.text()}`,
    ).toBeTruthy();

    return (await response.json()) as T;
  }

  async patch<T>(path: string, data: unknown): Promise<T> {
    const response = await this.context.patch(path, { data });
    expect(
      response.ok(),
      `PATCH ${path} -> ${String(response.status())} ${await response.text()}`,
    ).toBeTruthy();

    return (await response.json()) as T;
  }

  async fieldWorkerNamed(fullName: string): Promise<{ id: string; full_name: string }> {
    const workers = await this.get<{ id: string; full_name: string }[]>("/field-workers");
    const worker = workers.find((candidate) => candidate.full_name === fullName);
    expect(worker, `field worker "${fullName}" not found`).toBeDefined();

    return worker as { id: string; full_name: string };
  }

  /** A field worker of the seed company who can do every service type, named uniquely so a
   * spec can find its own routes with the board's name search. */
  async createFieldWorker(suffix: string): Promise<{ id: string; full_name: string }> {
    const [company] = await this.get<{ id: string }[]>("/contractor-companies");
    const serviceTypes = await this.get<{ id: string }[]>("/service-types");

    return this.post("/field-workers", {
      full_name: `E2E Profissional ${suffix}`,
      contractor_company_id: company?.id,
      service_type_ids: serviceTypes.map((serviceType) => serviceType.id),
    });
  }

  /** A building with one floor and `pointCount` service points close to each other. */
  async createSite(suffix: string, pointCount = 1) {
    const building = await this.post<Named>("/buildings", {
      name: `E2E Bloco ${suffix}`,
      campus_area: "E2E",
      // Every building is registered with its outline; this one holds the points below.
      footprint: E2E_SITE_OUTLINE,
    });
    const floor = await this.post<{ id: string; label: string }>("/floors", {
      building_id: building.id,
      label: `Térreo ${suffix}`,
    });
    const points: Named[] = [];
    for (let index = 0; index < pointCount; index += 1) {
      points.push(
        await this.post<Named>("/service-points", {
          floor_id: floor.id,
          name: `E2E Sala ${String(index + 1)} ${suffix}`,
          // No coordinates: a point is where its building is (the outline's centre).
          description: "",
        }),
      );
    }

    return { building, floor, points };
  }

  async createRoute(
    fieldWorkerId: string,
    routeDate: string,
    servicePointIds: string[],
    arrivalWindowTo: string | null = null,
  ) {
    return this.post<{ id: string }>("/routes", {
      field_worker_id: fieldWorkerId,
      route_date: routeDate,
      route_type: "REGULAR",
      stops: servicePointIds.map((servicePointId) => ({
        service_point_id: servicePointId,
        expected_arrival_to: arrivalWindowTo,
      })),
    });
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }
}
