import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { usePlacePoints, usePlaces } from "@/components/buildings/useBuildingRecords";
import { useCampusBuildingMap } from "@/components/buildings/useCampusBuildingMap";
import { FakeApi } from "@/test/fakeApi";

const PLACE = { id: "pl1", name: "Ponto de ônibus", latitude: -7.21, longitude: -35.91 };
const BUILDING = {
  id: "b1",
  name: "Bloco CI",
  campus_area: "CCT",
  footprint: null,
  footprint_source: null,
  osm_way_id: null,
};
const FLOOR = { id: "f1", building_id: "b1", label: "Térreo", level: 0 };
const BUILDING_POINT = { id: "p1", floor_id: "f1", place_id: null };
const PLACE_POINT = { id: "p2", floor_id: null, place_id: "pl1" };

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe("usePlaces", () => {
  it("returns the places the API lists", async () => {
    const api = new FakeApi().on("GET", "/places", [PLACE]).install();

    const { result } = renderHook(() => usePlaces(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([PLACE]);
    });
    expect(api.sent("GET", "/places")).toHaveLength(1);
  });

  it("fails the query when the API answers with an error", async () => {
    new FakeApi().on("GET", "/places", { detail: "no" }, 401).install();

    const { result } = renderHook(() => usePlaces(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("usePlacePoints", () => {
  it("asks for the points of that place only", async () => {
    const api = new FakeApi().on("GET", "/service-points", [PLACE_POINT]).install();

    const { result } = renderHook(() => usePlacePoints("pl1"), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([PLACE_POINT]);
    });
    const [request] = api.sent("GET", "/service-points");
    expect(request?.query.get("place_id")).toBe("pl1");
    expect(request?.query.has("building_id")).toBe(false);
  });
});

describe("useCampusBuildingMap with a place point", () => {
  it("does not count a floor-less point toward any building", async () => {
    new FakeApi()
      .on("GET", "/buildings", [BUILDING])
      .on("GET", "/floors", [FLOOR])
      .on("GET", "/service-points", [BUILDING_POINT, PLACE_POINT])
      .install();

    const { result } = renderHook(() => useCampusBuildingMap(), { wrapper });

    await waitFor(() => {
      expect(result.current.countsOf("b1")).toEqual({ floors: 1, points: 1 });
    });
  });
});
