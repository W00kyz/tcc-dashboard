import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef, type RefObject } from "react";

import { createCampusMap } from "@/components/map/campusMap";
import { useTranslation } from "@/i18n/useTranslation";
import type { GeoPolygon, OsmBuilding } from "@/lib/osmBuildings";

// Leaflet paints SVG attributes, not CSS: these hexes mirror DESIGN.md's tokens (same greys and
// sign-blue as WorkerPositionsMap).
const CANDIDATE_STYLE: L.PathOptions = { color: "#6b7079", weight: 1, fillOpacity: 0.15 };
const SELECTED_STYLE: L.PathOptions = { color: "#14213d", weight: 3, fillOpacity: 0.35 };
const LINKED_STYLE: L.PathOptions = {
  color: "#14213d",
  weight: 2,
  fillColor: "#14213d",
  fillOpacity: 0.25,
};

interface FootprintPickerMapProps {
  candidates: OsmBuilding[];
  linked: GeoPolygon | null;
  selectedWayId: number | null;
  /** osm_way_id -> name of the other building that already owns that outline. */
  linkedElsewhere: Map<number, string>;
  onPick: (wayId: number) => void;
}

// GeoJSON is [lon, lat]; Leaflet wants [lat, lon].
function toLatLngs(polygon: GeoPolygon): L.LatLngTuple[][] {
  return polygon.coordinates.map((ring) => ring.map(([lon, lat]): L.LatLngTuple => [lat, lon]));
}

type Translate = ReturnType<typeof useTranslation>["t"];

function candidateLabel(candidate: OsmBuilding, owner: string | undefined, t: Translate): string {
  const name = candidate.name ?? t("footprintUnnamed");
  if (owner === undefined) {
    return name;
  }

  return `${name} · ${t("footprintLinkedElsewhere").replace("{building}", owner)}`;
}

function drawCandidates(layer: L.LayerGroup, props: FootprintPickerMapProps, t: Translate): void {
  for (const candidate of props.candidates) {
    const owner = props.linkedElsewhere.get(candidate.osmWayId);
    const style = candidate.osmWayId === props.selectedWayId ? SELECTED_STYLE : CANDIDATE_STYLE;
    L.polygon(toLatLngs(candidate.footprint), style)
      .bindTooltip(candidateLabel(candidate, owner, t), { sticky: true })
      .on("click", () => {
        props.onPick(candidate.osmWayId);
      })
      .addTo(layer);
  }
}

function drawLinked(layer: L.LayerGroup, linked: GeoPolygon | null): void {
  if (linked === null) {
    return;
  }
  // Not clickable: it is the current state, drawn under the candidates' clicks.
  L.polygon(toLatLngs(linked), { ...LINKED_STYLE, interactive: false }).addTo(layer);
}

// One map for the component's lifetime; the returned ref holds the layer polygons are drawn on.
function useCampusLayer(containerRef: RefObject<HTMLDivElement | null>) {
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    const { map, dispose } = createCampusMap(containerRef.current);
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      dispose();
      layerRef.current = null;
    };
  }, [containerRef]);

  return layerRef;
}

// Redraws on every change; the latest onPick is read through a ref so a new callback identity
// does not rebuild the polygons.
function useRedraw(layerRef: RefObject<L.LayerGroup | null>, props: FootprintPickerMapProps) {
  const { t } = useTranslation();
  const { candidates, linked, selectedWayId, linkedElsewhere, onPick } = props;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const layer = layerRef.current;
    if (layer === null) {
      return;
    }
    layer.clearLayers();
    const pick = (id: number) => {
      onPickRef.current(id);
    };
    drawCandidates(layer, { candidates, linked, selectedWayId, linkedElsewhere, onPick: pick }, t);
    drawLinked(layer, linked);
  }, [candidates, linked, selectedWayId, linkedElsewhere, layerRef, t]);
}

/** Leaflet map where the manager clicks the OSM outline that matches the building. Leaflet is
 * driven imperatively: polygons are redrawn on every change. */
export function FootprintPickerMap(props: FootprintPickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useCampusLayer(containerRef);
  useRedraw(layerRef, props);

  return <PickerLayout containerRef={containerRef} {...props} />;
}

type PickerLayoutProps = FootprintPickerMapProps & {
  containerRef: RefObject<HTMLDivElement | null>;
};

function PickerLayout(props: PickerLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div
        ref={props.containerRef}
        role="region"
        aria-label={t("footprintMapLabel")}
        className="h-80 w-full rounded-md border md:flex-1"
      />
      <CandidateList
        candidates={props.candidates}
        selectedWayId={props.selectedWayId}
        onPick={props.onPick}
      />
    </div>
  );
}

interface CandidateListProps {
  candidates: OsmBuilding[];
  selectedWayId: number | null;
  onPick: (wayId: number) => void;
}

const hasName = (candidate: OsmBuilding): boolean => candidate.name !== null;

// Polygons are SVG paths with no accessible name, so this list is the keyboard and screen
// reader route to the same action. Unnamed candidates are only pickable on the map.
function CandidateList({ candidates, selectedWayId, onPick }: CandidateListProps) {
  const { t } = useTranslation();

  return (
    <ul
      aria-label={t("footprintCandidatesLabel")}
      className="max-h-80 space-y-1 overflow-y-auto md:w-56"
    >
      {candidates.filter(hasName).map((candidate) => (
        <li key={candidate.osmWayId}>
          <CandidateButton
            candidate={candidate}
            pressed={candidate.osmWayId === selectedWayId}
            onPick={onPick}
          />
        </li>
      ))}
    </ul>
  );
}

interface CandidateButtonProps {
  candidate: OsmBuilding;
  pressed: boolean;
  onPick: (wayId: number) => void;
}

function CandidateButton({ candidate, pressed, onPick }: CandidateButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className="hover:bg-muted aria-pressed:bg-muted w-full rounded px-2 py-1 text-left text-sm"
      onClick={() => {
        onPick(candidate.osmWayId);
      }}
    >
      {candidate.name}
    </button>
  );
}
