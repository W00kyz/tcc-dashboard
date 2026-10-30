const OUTSIDE_CAMPUS = "OUTSIDE_CAMPUS";

/** The API refused a pin off the campus (422 with `OUTSIDE_CAMPUS`). */
export class OutsideCampusError extends Error {
  constructor(request: string, position: { lat: number; lng: number }) {
    super(
      `${request} refused: ${String(position.lat)}, ${String(position.lng)} is outside the campus.`,
    );
    this.name = "OutsideCampusError";
  }
}

/** True for a pin off the campus: the API answers {"detail": {"code": "OUTSIDE_CAMPUS"}}.
 * @example if (response.status === 422 && isOutsideCampus(error)) throw new OutsideCampusError(...) */
export function isOutsideCampus(error: unknown): boolean {
  const detail = (error as { detail?: { code?: string } | null } | undefined)?.detail;

  return typeof detail === "object" && detail !== null && detail.code === OUTSIDE_CAMPUS;
}
