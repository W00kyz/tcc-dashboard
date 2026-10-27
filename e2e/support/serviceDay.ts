import { SeedApi } from "./api";

/**
 * Makes the whole run a service day. The allocation refuses "Iniciar rota" outside
 * `service_weekdays` (NOT_A_SERVICE_DAY, weekdays only by default) and after `workday_end_time`
 * (WORKDAY_OVER, 17:00 on campus by default), and the release scan closes every open route at
 * that hour — so a run on a weekend or in the evening would find no field work to show. Every
 * weekday, until the last second of the campus day, for the run only: the sweep puts the
 * settings row back exactly as it was (support/cleanup.ts).
 *
 * The campus rectangle is left alone: the E2E site (support/api.ts) is inside the default one.
 */
export async function openServiceDay(): Promise<void> {
  const admin = await SeedApi.signIn("admin");
  await admin.put("/settings", {
    service_weekdays: [0, 1, 2, 3, 4, 5, 6],
    workday_end_time: "23:59:59",
  });
  await admin.dispose();
}
