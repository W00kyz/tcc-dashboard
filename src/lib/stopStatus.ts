/** The route-stop `status` field arrives from the API as an unconstrained string
 * (see `RouteStopOut.status` in the OpenAPI contract — no enum). This guard folds
 * it onto the states the board knows how to render, defaulting anything
 * unrecognized to PENDING so a new backend state never blanks the strip. RELEASED is a
 * stop given back to the pool (spec 2026-10-20-alocacao-automatica §5.3). */
export type StopStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "RELEASED";

export function toStopStatus(raw: string): StopStatus {
  return raw === "IN_PROGRESS" || raw === "DONE" || raw === "RELEASED" ? raw : "PENDING";
}
