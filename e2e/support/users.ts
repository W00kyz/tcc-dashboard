/** Seed users (backend `app.seed`) and where each one's browser session is stored by the
 * setup project. Specs pick a role with `test.use({ storageState: STORAGE.manager })`. */
export const SEED_PASSWORD = "trocar-esta-senha";

export const SEED_USERS = {
  admin: "admin@pu.ufcg.edu.br",
  manager: "larissa@pu.ufcg.edu.br",
  fieldWorker: "joao@empresa.com",
} as const;

export type SeedRole = keyof typeof SEED_USERS;

export const STORAGE: Record<SeedRole, string> = {
  admin: "e2e/.auth/admin.json",
  manager: "e2e/.auth/manager.json",
  fieldWorker: "e2e/.auth/field-worker.json",
};
