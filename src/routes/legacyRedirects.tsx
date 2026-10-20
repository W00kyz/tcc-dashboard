import { Navigate, useParams } from "react-router-dom";

/** `/predios/:id` and `/predios/:id/andares` were a building's own pages; everything about a
 * building now opens from the map (`/predios?predio=<id>`), so old links land there. */
export function LegacyBuildingRedirect() {
  const { buildingId = "" } = useParams<{ buildingId: string }>();

  return <Navigate to={`/predios?predio=${buildingId}`} replace />;
}
