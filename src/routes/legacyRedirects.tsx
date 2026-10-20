import { Navigate, useParams, useSearchParams } from "react-router-dom";

/** `/predios/:id` and `/predios/:id/andares` were a building's own pages; everything about a
 * building now opens from the map (`/predios?predio=<id>`), so old links land there. */
export function LegacyBuildingRedirect() {
  const { buildingId = "" } = useParams<{ buildingId: string }>();

  return <Navigate to={`/predios?predio=${buildingId}`} replace />;
}

/** `/rotas/nova?type=…` was the route builder page; it is a Dialog over the board now. */
export function LegacyNewRouteRedirect() {
  const [params] = useSearchParams();
  const routeType = params.get("type") === "OCCASIONAL" ? "OCCASIONAL" : "REGULAR";

  return <Navigate to={`/rotas?nova=${routeType}`} replace />;
}

/** `/rotas/:id/editar` was the route editor page; it is a Dialog over the board now. */
export function LegacyEditRouteRedirect() {
  const { routeId = "" } = useParams<{ routeId: string }>();

  return <Navigate to={`/rotas?editar=${routeId}`} replace />;
}
