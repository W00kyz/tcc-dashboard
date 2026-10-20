import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import type { components } from "@/api/generated/schema";
import { drawBuildings, type MapBuilding } from "@/components/board/BuildingsLayer";
import { nextViewAction, type ViewAction } from "@/components/board/viewMemory";
import { createCampusMap } from "@/components/map/campusMap";
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";

type BoardPosition = components["schemas"]["BoardPosition"];

// Older than this, a fix is drawn grey: the worker may have moved on since.
export const STALE_AFTER_SECONDS = 15 * 60;

// Leaflet paints SVG attributes, not CSS: these hexes mirror DESIGN.md's tokens — sign-blue
// for a worker in the field, status-late for one whose route is delayed, status-pending for a
// fix too old to trust. Sign-yellow stays reserved for counters.
const MARKER_STYLE = {
  live: { color: "#14213d", fillColor: "#14213d" },
  late: { color: "#ffffff", fillColor: "#b3261e" },
  stale: { color: "#6b7079", fillColor: "#eceee9" },
} as const;

export type MarkerState = keyof typeof MARKER_STYLE;

/** Which of the three marker treatments a fix gets. Lateness wins over staleness: a delayed
 * route is the exception the manager must see, however old the last fix. */
export function markerState(position: BoardPosition, delayedWorkerIds: Set<string>): MarkerState {
  if (delayedWorkerIds.has(position.field_worker_id)) {
    return "late";
  }

  return position.age_seconds > STALE_AFTER_SECONDS ? "stale" : "live";
}

interface WorkerPositionsMapProps {
  positions: BoardPosition[];
  delayedWorkerIds?: Set<string>;
  selectedWorkerId?: string | null;
  onSelectWorker?: (workerId: string) => void;
  buildings?: MapBuilding[];
  selectedBuildingId?: string | null;
  onSelectBuilding?: (buildingId: string | null) => void;
  className?: string;
}

// With 50–100 workers on one campus, permanent name labels pile into an unreadable mass. Only
// the exceptions (late) and the worker the manager picked keep their label; the rest show it
// on hover.
function keepsPermanentLabel(state: MarkerState, selected: boolean): boolean {
  return state === "late" || selected;
}

const NO_DELAYED_WORKERS = new Set<string>();
const NO_BUILDINGS: MapBuilding[] = [];

// Close enough to tell one building from the next; a manager already zoomed in further keeps
// their zoom.
const WORKER_FOCUS_ZOOM = 18;
const GLIDE_SECONDS = 0.8;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** Brings a worker's marker to the centre with one smooth pan-and-zoom; an instant jump for
 * people who asked their system for reduced motion. */
function glideTo(map: L.Map, target: L.LatLng): void {
  const zoom = Math.max(map.getZoom(), WORKER_FOCUS_ZOOM);
  if (prefersReducedMotion()) {
    map.setView(target, zoom, { animate: false });

    return;
  }
  map.flyTo(target, zoom, { duration: GLIDE_SECONDS, easeLinearity: 0.25 });
}

/** Frames a whole building, with the same reduced-motion rule as `glideTo`. */
function glideToBounds(map: L.Map, bounds: L.LatLngBounds): void {
  const options = { padding: L.point(24, 24) };
  if (prefersReducedMotion()) {
    map.fitBounds(bounds, { ...options, animate: false });

    return;
  }
  map.flyToBounds(bounds, { ...options, duration: GLIDE_SECONDS });
}

function workerLabel(position: BoardPosition, state: MarkerState, lateSuffix: string): string {
  return state === "late"
    ? `${position.field_worker_name} · ${lateSuffix}`
    : position.field_worker_name;
}

interface WorkerDrawing {
  map: L.Map;
  layer: L.LayerGroup;
  positions: BoardPosition[];
  delayedWorkerIds: Set<string>;
  selectedWorkerId: string | null;
  lateSuffix: string;
  onSelect: (workerId: string) => void;
}

function workerMarker(drawing: WorkerDrawing, position: BoardPosition): L.CircleMarker {
  const state = markerState(position, drawing.delayedWorkerIds);
  const selected = position.field_worker_id === drawing.selectedWorkerId;

  return L.circleMarker([position.latitude, position.longitude], {
    radius: selected ? 11 : state === "late" ? 9 : 6,
    fillOpacity: 0.95,
    // Path bubbles clicks to the map by default; that would clear the open building.
    bubblingMouseEvents: false,
    weight: selected ? 4 : 2,
    ...MARKER_STYLE[state],
    // Selection: a thick white halo, not a new colour (sign-yellow is for counters).
    ...(selected ? { color: "#ffffff" } : {}),
  }).bindTooltip(workerLabel(position, state, drawing.lateSuffix), {
    permanent: keepsPermanentLabel(state, selected),
    direction: "top",
  });
}

function drawWorkers(drawing: WorkerDrawing): void {
  drawing.layer.clearLayers();
  for (const position of drawing.positions) {
    const marker = workerMarker(drawing, position).on("click", () => {
      drawing.onSelect(position.field_worker_id);
      glideTo(drawing.map, marker.getLatLng());
    });
    marker.addTo(drawing.layer);
    if (position.field_worker_id === drawing.selectedWorkerId) {
      marker.bringToFront();
    }
  }
}

interface MapLayers {
  buildings: L.LayerGroup;
  workers: L.LayerGroup;
}

interface CampusMapHandle {
  mapRef: React.RefObject<L.Map | null>;
  layersRef: React.RefObject<MapLayers | null>;
}

// Lets an effect call the freshest callback without redrawing whenever its identity changes.
function useLatest<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  ref.current = value;

  return ref;
}

// Added bottom-up: buildings, then workers, so workers stay clickable on top.
function createLayers(map: L.Map): MapLayers {
  return {
    buildings: L.layerGroup().addTo(map),
    workers: L.layerGroup().addTo(map),
  };
}

// Fills the handle's refs and returns the cleanup that empties them again.
function attachCampusMap(
  handle: CampusMapHandle,
  container: HTMLDivElement,
  onEmptyClick: () => void,
): () => void {
  const { map, dispose } = createCampusMap(container);
  // Building polygons stop their own click, so this only fires on empty map.
  map.on("click", onEmptyClick);
  handle.mapRef.current = map;
  handle.layersRef.current = createLayers(map);

  return () => {
    dispose();
    handle.mapRef.current = null;
    handle.layersRef.current = null;
  };
}

function emptyHandle(): CampusMapHandle {
  return { mapRef: { current: null }, layersRef: { current: null } };
}

function useCampusMapLayers(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onEmptyClick: () => void,
): CampusMapHandle {
  const handle = useRef(emptyHandle());
  const emptyClickRef = useLatest(onEmptyClick);

  useEffect(() => {
    if (containerRef.current === null) {
      return undefined;
    }

    return attachCampusMap(handle.current, containerRef.current, () => {
      emptyClickRef.current();
    });
  }, [containerRef, emptyClickRef]);

  return handle.current;
}

type PolygonsRef = React.RefObject<Map<string, L.Polygon>>;

interface SavedView {
  center: L.LatLng;
  zoom: number;
}

/** Back to the view the manager had before the building opened, with the same reduced-motion
 * rule as the other glides. */
function restoreView(map: L.Map, view: SavedView): void {
  if (prefersReducedMotion()) {
    map.setView(view.center, view.zoom, { animate: false });

    return;
  }
  map.flyTo(view.center, view.zoom, { duration: GLIDE_SECONDS });
}

function rememberOrRestore(
  map: L.Map,
  action: ViewAction,
  savedView: React.RefObject<SavedView | null>,
): void {
  if (action === "capture") {
    savedView.current = { center: map.getCenter(), zoom: map.getZoom() };
  } else if (action === "restore" && savedView.current !== null) {
    restoreView(map, savedView.current);
  }
}

// Runs after the draw effect so the polygon it reads is the fresh one. Zooms when the
// selection changes, not when the building list is refetched; closing the building flies back
// to the view captured when the first building opened (A → B keeps the view from before A).
function useGlideToBuilding(
  mapRef: CampusMapHandle["mapRef"],
  polygonsRef: PolygonsRef,
  selectedId: string | null,
): void {
  const prevSelectedId = useRef<string | null>(null);
  const savedView = useRef<SavedView | null>(null);

  useEffect(() => {
    const action = nextViewAction(prevSelectedId.current, selectedId);
    prevSelectedId.current = selectedId;
    if (mapRef.current === null) {
      return;
    }
    rememberOrRestore(mapRef.current, action, savedView);
    const bounds =
      selectedId === null ? undefined : polygonsRef.current.get(selectedId)?.getBounds();
    if (bounds !== undefined) {
      glideToBounds(mapRef.current, bounds);
    }
  }, [mapRef, polygonsRef, selectedId]);
}

function useBuildingsLayer(handle: CampusMapHandle, props: WorkerPositionsMapProps): void {
  const { buildings = NO_BUILDINGS, selectedBuildingId = null } = props;
  const polygonsRef = useRef(new Map<string, L.Polygon>());
  const onSelectRef = useLatest(props.onSelectBuilding);

  useEffect(() => {
    if (handle.layersRef.current === null) {
      return;
    }
    const layer = handle.layersRef.current.buildings;
    polygonsRef.current = drawBuildings(layer, buildings, selectedBuildingId, (id) => {
      onSelectRef.current?.(id);
    });
  }, [handle.layersRef, buildings, selectedBuildingId, onSelectRef]);
  useGlideToBuilding(handle.mapRef, polygonsRef, selectedBuildingId);
}

function useWorkersLayer(handle: CampusMapHandle, props: WorkerPositionsMapProps): void {
  const { t } = useTranslation();
  const { positions, delayedWorkerIds = NO_DELAYED_WORKERS, selectedWorkerId = null } = props;
  const onSelectRef = useLatest(props.onSelectWorker);

  useEffect(() => {
    if (handle.mapRef.current === null || handle.layersRef.current === null) {
      return;
    }
    drawWorkers({
      map: handle.mapRef.current,
      layer: handle.layersRef.current.workers,
      positions,
      delayedWorkerIds,
      selectedWorkerId,
      lateSuffix: t("boardMapLateSuffix"),
      onSelect: (workerId) => onSelectRef.current?.(workerId),
    });
  }, [handle, positions, delayedWorkerIds, selectedWorkerId, t, onSelectRef]);
}

/** RF42: the latest position each field worker reported, on a map, with the campus buildings
 * under them. Leaflet is driven imperatively from
 * effects — the component owns one map for its lifetime and only redraws the layer whose
 * input changed. */
export function WorkerPositionsMap(props: WorkerPositionsMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const handle = useCampusMapLayers(containerRef, () => props.onSelectBuilding?.(null));
  useBuildingsLayer(handle, props);
  useWorkersLayer(handle, props);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t("workerPositionsMapLabel")}
      className={cn("h-80 w-full rounded-md border", props.className)}
    />
  );
}
