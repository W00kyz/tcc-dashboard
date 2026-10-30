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

interface E2eCompany {
  id: string;
  name: string;
  serviceType: Named;
}

/** A worker signed up through the app's public registration (`POST /auth/register`). */
export interface RegisteredWorker {
  fullName: string;
  email: string;
  password: string;
}

/** Short unique suffix so every spec run creates its own records instead of leaning on
 * whatever happens to be in the dev database. */
export function uniqueSuffix(): string {
  return Date.now().toString(36).slice(-6);
}

/** 14 digits no other company has: the CNPJ is unique. */
function uniqueCnpj(): string {
  return `${String(Date.now())}${String(Math.floor(Math.random() * 10))}`
    .slice(-14)
    .padStart(14, "9");
}

/** Signs a field worker up the way the app's "Criar conta" does: name, e-mail, password, the
 * company picked from the public list and the current privacy notice accepted (the consent is
 * recorded with the registration). The worker waits for a manager's approval. */
export async function registerWorker(suffix: string, companyId: string): Promise<RegisteredWorker> {
  const anonymous = await request.newContext({ baseURL: API_URL });
  const notice = await anonymous.get("/public/privacy-notice");
  expect(notice.ok(), `GET /public/privacy-notice -> ${String(notice.status())}`).toBeTruthy();
  const { version } = (await notice.json()) as { version: number };
  const worker = {
    fullName: `E2E Profissional ${suffix}`,
    email: `e2e-${suffix}@empresa.com`,
    password: "senha-e2e-forte",
  };
  const response = await anonymous.post("/auth/register", {
    data: {
      name: worker.fullName,
      email: worker.email,
      password: worker.password,
      contractor_company_id: companyId,
      privacy_notice_version: version,
    },
  });
  expect(
    response.ok(),
    `POST /auth/register -> ${String(response.status())} ${await response.text()}`,
  ).toBeTruthy();
  await anonymous.dispose();

  return worker;
}

/**
 * Thin client over the backend for arranging test data. Specs exercise the UI; this only sets
 * the stage. @example const api = await SeedApi.signIn("manager");
 */
export class SeedApi {
  private constructor(private readonly context: APIRequestContext) {}

  static async signIn(role: SeedRole = "manager"): Promise<SeedApi> {
    return SeedApi.signInAs(SEED_USERS[role], SEED_PASSWORD);
  }

  /** Signs in with any account, e.g. a worker a spec registered with `registerWorker`. */
  static async signInAs(email: string, password: string): Promise<SeedApi> {
    const anonymous = await request.newContext({ baseURL: API_URL });
    const login = await anonymous.post("/auth/login", { data: { email, password } });
    expect(login.ok(), `login as ${email} failed with ${String(login.status())}`).toBeTruthy();
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

  /** A POST whose refusal is the point of the test: status and body, whatever they are. */
  async postRaw(path: string, data: unknown): Promise<{ status: number; body: unknown }> {
    const response = await this.context.post(path, { data });

    return { status: response.status(), body: await response.json() };
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

  async put<T>(path: string, data: unknown): Promise<T> {
    const response = await this.context.put(path, { data });
    expect(
      response.ok(),
      `PUT ${path} -> ${String(response.status())} ${await response.text()}`,
    ).toBeTruthy();

    return (await response.json()) as T;
  }

  async fieldWorkerNamed(fullName: string): Promise<{ id: string; full_name: string }> {
    const workers = await this.get<{ id: string; full_name: string }[]>("/field-workers");
    const worker = workers.find((candidate) => candidate.full_name === fullName);
    expect(worker, `field worker "${fullName}" not found`).toBeDefined();

    return worker as { id: string; full_name: string };
  }

  /** An E2E company owning one E2E service type: points of that type are in the pool of its
   * workers only, so a spec's worker is handed exactly the spec's points. */
  async createCompany(suffix: string): Promise<E2eCompany> {
    const company = await this.post<{ id: string; name: string; service_types: Named[] }>(
      "/contractor-companies",
      {
        name: `E2E Empresa ${suffix}`,
        cnpj: uniqueCnpj(),
        service_types: [{ name: `E2E Tipo ${suffix}`, average_duration_minutes: 30 }],
      },
    );
    const [serviceType] = company.service_types;
    if (serviceType === undefined) {
      throw new Error(`company "${company.name}" came back with no service type; expected one.`);
    }

    return { id: company.id, name: company.name, serviceType };
  }

  /** A building with its Térreo floor and `pointCount` service points close to each other, typed with
   * `serviceTypeId` — by default the type of a new E2E company made for this site. */
  async createSite(suffix: string, pointCount = 1, serviceTypeId?: string) {
    const company = serviceTypeId === undefined ? await this.createCompany(suffix) : null;
    const building = await this.post<Named>("/buildings", {
      name: `E2E Bloco ${suffix}`,
      campus_area: "E2E",
      // Every building is registered with its outline; this one holds the points below.
      footprint: E2E_SITE_OUTLINE,
    });
    // A building is born with its Térreo: the site uses that floor instead of adding a second.
    const [floor] = await this.get<{ id: string; label: string }[]>(
      `/floors?building_id=${building.id}`,
    );
    if (floor === undefined) {
      throw new Error(`building "${building.name}" came back with no floor; expected its Térreo.`);
    }
    const points: Named[] = [];
    for (let index = 0; index < pointCount; index += 1) {
      points.push(
        await this.post<Named>("/service-points", {
          floor_id: floor.id,
          name: `E2E Sala ${String(index + 1)} ${suffix}`,
          // No coordinates: a point is where its building is (the outline's centre).
          description: "",
          service_type_id: serviceTypeId ?? company?.serviceType.id,
        }),
      );
    }

    return { company, building, floor, points };
  }

  /** Approves a self-registered worker, as the manager's "Aprovar" does. */
  async approveWorker(fullName: string): Promise<{ id: string; full_name: string }> {
    const worker = await this.fieldWorkerNamed(fullName);
    await this.post(`/field-workers/${worker.id}/approve`, {});

    return worker;
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }
}
