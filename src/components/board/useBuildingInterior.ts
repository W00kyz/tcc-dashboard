import { useQueries, useQuery } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";

type ApiClient = ReturnType<typeof createApiClient>;
type FloorOut = components["schemas"]["FloorOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];

interface BuildingInterior {
  floors: FloorOut[] | undefined;
  pointsByFloor: Map<string, ServicePointOut[]>;
  isLoading: boolean;
  isError: boolean;
}

async function fetchFloors(client: ApiClient, buildingId: string | null): Promise<FloorOut[]> {
  const { data, response } = await client.GET("/floors", {
    params: { query: { building_id: buildingId } },
  });
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(
      `GET /floors?building_id=${String(buildingId)} failed with status ${String(response.status)}; expected a list of floors.`,
    );
  }

  return data;
}

async function fetchFloorPoints(client: ApiClient, floorId: string): Promise<ServicePointOut[]> {
  const { data, response } = await client.GET("/service-points", {
    params: { query: { floor_id: floorId } },
  });
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(
      `GET /service-points?floor_id=${floorId} failed with status ${String(response.status)}; expected a list of points.`,
    );
  }

  return data;
}

// `useQueries` answers in the order of the floors it was given.
function groupByFloor(
  floors: FloorOut[],
  pointLists: (ServicePointOut[] | undefined)[],
): Map<string, ServicePointOut[]> {
  return new Map(floors.map((floor, index) => [floor.id, pointLists[index] ?? []]));
}

function useFloorPoints(client: ApiClient, floors: FloorOut[] | undefined) {
  return useQueries({
    queries: (floors ?? []).map((floor) => ({
      queryKey: ["service-points", { floorId: floor.id }],
      queryFn: () => fetchFloorPoints(client, floor.id),
    })),
  });
}

/** Floors of one building and the service points of each floor; idle while `buildingId` is null.
 * @example const { floors, pointsByFloor } = useBuildingInterior(selectedBuildingId); */
export function useBuildingInterior(buildingId: string | null): BuildingInterior {
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const floorsQuery = useQuery({
    queryKey: ["floors", { buildingId }],
    enabled: buildingId !== null,
    queryFn: () => fetchFloors(client, buildingId),
  });
  const pointQueries = useFloorPoints(client, floorsQuery.data);
  const lists = pointQueries.map((query) => query.data);

  return {
    floors: floorsQuery.data,
    pointsByFloor: groupByFloor(floorsQuery.data ?? [], lists),
    isLoading: floorsQuery.isLoading || pointQueries.some((query) => query.isLoading),
    isError: floorsQuery.isError || pointQueries.some((query) => query.isError),
  };
}
