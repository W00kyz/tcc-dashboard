import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";

type BuildingOut = components["schemas"]["BuildingOut"];
type FloorOut = components["schemas"]["FloorOut"];
type RoomOut = components["schemas"]["RoomOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];
type ServiceTypeOut = components["schemas"]["ServiceTypeOut"];

/** The API client for the signed-in manager. Falls back to an empty token instead of asserting
 * a session, so a page renders (and its requests fail cleanly) before the session hydrates. */
export function useApiClient() {
  const { session } = useAuth();

  return createApiClient(apiBaseUrl, session?.accessToken ?? "");
}

// A 401 from an expired token must fail the query, not read as "no records": failing lets React
// Query retry once the session refreshed, where an empty list stuck until the next reload.
function listOrThrow<T>(data: T[] | undefined, response: Response, request: string): T[] {
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(
      `${request} failed with status ${String(response.status)}; expected a list of records.`,
    );
  }

  return data;
}

// Query keys are shared with the Quadro de rotas (useBoardBuildings / useBuildingInterior), so a
// change saved here refreshes the board's map and panel too.

/** Refreshes what a room change touches: the rooms and, through them, their service points. */
export function useRefreshRooms() {
  const queryClient = useQueryClient();

  return () => {
    for (const queryKey of [["rooms"], ["service-points"]]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

/** Every building; the detail page picks its own from the same cached list the board uses. */
export function useBuildings() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["buildings"],
    queryFn: async (): Promise<BuildingOut[]> => {
      const { data, response } = await client.GET("/buildings");

      return listOrThrow(data, response, "GET /buildings");
    },
  });
}

/** Floors of one building, ordered by level. */
export function useBuildingFloors(buildingId: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["floors", { buildingId }],
    queryFn: async (): Promise<FloorOut[]> => {
      const { data, response } = await client.GET("/floors", {
        params: { query: { building_id: buildingId } },
      });

      return listOrThrow(data, response, `GET /floors?building_id=${buildingId}`);
    },
  });
}

/** Rooms of one building, across its floors. */
export function useBuildingRooms(buildingId: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["rooms", { buildingId }],
    queryFn: async (): Promise<RoomOut[]> => {
      const { data, response } = await client.GET("/rooms", {
        params: { query: { building_id: buildingId } },
      });

      return listOrThrow(data, response, `GET /rooms?building_id=${buildingId}`);
    },
  });
}

/** Every service point of one building, across its floors. */
export function useBuildingPoints(buildingId: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["service-points", { buildingId }],
    queryFn: async (): Promise<ServicePointOut[]> => {
      const { data, response } = await client.GET("/service-points", {
        params: { query: { building_id: buildingId } },
      });

      return listOrThrow(data, response, `GET /service-points?building_id=${buildingId}`);
    },
  });
}

/** Every floor on campus (the campus map groups points into buildings through them). */
export function useAllFloors() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["floors", "all"],
    queryFn: async (): Promise<FloorOut[]> => {
      const { data, response } = await client.GET("/floors");

      return listOrThrow(data, response, "GET /floors");
    },
  });
}

/** Every service point on campus. */
export function useAllPoints() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["service-points", "all"],
    queryFn: async (): Promise<ServicePointOut[]> => {
      const { data, response } = await client.GET("/service-points");

      return listOrThrow(data, response, "GET /service-points");
    },
  });
}

/** Every service type with its company, or only the ones no company has adopted yet. The key
 * starts with "service-types" so a company save refreshes both lists. */
export function useServiceTypes({ unassigned = false, enabled = true } = {}) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["service-types", { unassigned }],
    enabled,
    queryFn: async (): Promise<ServiceTypeOut[]> => {
      const { data, response } = await client.GET("/service-types", {
        params: { query: unassigned ? { unassigned: true } : {} },
      });

      return listOrThrow(data, response, "GET /service-types");
    },
  });
}
