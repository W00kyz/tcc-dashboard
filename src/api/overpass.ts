import { CAMPUS_BBOX } from "@/lib/campus";
import { buildOverpassQuery, type OsmBuilding, parseOverpassBuildings } from "@/lib/osmBuildings";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Building outlines on campus from the public Overpass API. `fetchImpl` is the test seam.
 * @example await fetchCampusBuildings() */
export async function fetchCampusBuildings(
  fetchImpl: typeof fetch = fetch,
): Promise<OsmBuilding[]> {
  const response = await fetchImpl(OVERPASS_URL, {
    method: "POST",
    body: new URLSearchParams({ data: buildOverpassQuery(CAMPUS_BBOX) }),
  });
  if (!response.ok) {
    throw new Error(
      `Overpass request failed with status ${String(response.status)}; expected 200 with building ways.`,
    );
  }

  return parseOverpassBuildings(await response.json());
}
