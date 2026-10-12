import { describe, expect, it } from "vitest";

import { fetchCampusBuildings } from "@/api/overpass";

// Named fake, per project convention: records the call and answers with a canned status and body.
class FakeOverpassFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];

  constructor(
    private readonly status: number,
    private readonly body: unknown,
  ) {}

  fetch: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    this.calls.push({ url, init });

    return Promise.resolve(new Response(JSON.stringify(this.body), { status: this.status }));
  };
}

describe("fetchCampusBuildings", () => {
  it("posts the campus query to Overpass and parses the buildings it returns", async () => {
    const fake = new FakeOverpassFetch(200, {
      elements: [
        {
          type: "way",
          id: 7,
          tags: { name: "Bloco A" },
          geometry: [
            { lat: 0, lon: 0 },
            { lat: 0, lon: 1 },
            { lat: 1, lon: 1 },
            { lat: 0, lon: 0 },
          ],
        },
      ],
    });

    const buildings = await fetchCampusBuildings(fake.fetch);

    expect(fake.calls[0]?.url).toBe("https://overpass-api.de/api/interpreter");
    expect(fake.calls[0]?.init?.method).toBe("POST");
    expect(buildings.map((building) => building.osmWayId)).toEqual([7]);
  });

  it("throws with the status and the expected shape when Overpass refuses the request", async () => {
    const fake = new FakeOverpassFetch(429, {});

    await expect(fetchCampusBuildings(fake.fetch)).rejects.toThrow(
      "Overpass request failed with status 429; expected 200 with building ways.",
    );
  });
});
