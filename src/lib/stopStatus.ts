/** The route-stop `status` field arrives from the API as an unconstrained string
 * (see `RouteStopOut.status` in the OpenAPI contract — no enum). This guard folds
 * it onto the three states the board knows how to render, defaulting anything
 * unrecognized to PENDING so a new backend state never blanks the strip. */
export type StopStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export function toStopStatus(raw: string): StopStatus {
  return raw === "IN_PROGRESS" || raw === "DONE" ? raw : "PENDING";
}
