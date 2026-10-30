import "leaflet/dist/leaflet.css";

import L from "leaflet";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { drawBuildings, type MapBuilding } from "@/components/board/BuildingsLayer";
import {
  draftPinIcon,
  drawPlaces,
  type MapPlace,
  placePopupKey,
  PIN_HEIGHT,
} from "@/components/board/PlacesLayer";
import { createCampusMap } from "@/components/map/campusMap";
import { popupOffset } from "@/components/map/popupOffset";
import { startPlacePinTool } from "@/components/map/placePinTool";
import { DRAFT_RECTANGLE_STYLE, startRectangleTool } from "@/components/map/rectangleTool";
import { useTranslation } from "@/i18n/useTranslation";
import type { GeoPolygon } from "@/lib/osmBuildings";
import { cn } from "@/lib/utils";

export interface CampusBuildingsMapProps {
  buildings: MapBuilding[];
  selectedId: string | null;
  /** A building was clicked (its id), or the empty map was (null). */
  onSelect: (buildingId: string | null) => void;
  /** Shown in a popup over the selected building. */
  selectedCard?: ReactNode;
  /** The rectangle tool is on: a drag on the map draws a rectangle. */
  drawing?: boolean;
  onDrawn?: (outline: GeoPolygon) => void;
  onExitDrawing?: () => void;
  /** The drawn rectangle waiting for its form; `draftForm` opens in a popup over it. */
  draft?: GeoPolygon | null;
  draftForm?: ReactNode;
  onDiscardDraft?: () => void;
  /** Outdoor places, drawn as pins. Selecting one and selecting a building is the page's call. */
  places?: MapPlace[];
  selectedPlaceId?: string | null;
  /** A pin was clicked (its id), or its popup was closed (null). A click on the empty map
   * still reports `onSelect(null)`: the page clears the place selection there too. */
  onSelectPlace?: (placeId: string | null) => void;
  /** Shown in a compact popup over the selected pin. */
  selectedPlaceCard?: ReactNode;
  /** The pin tool is on: the next click on the map places a pin. Wins over `drawing`. */
  pinning?: boolean;
  onPinned?: (latLng: { lat: number; lng: number }) => void;
  onExitPinning?: () => void;
  /** The point of a new place waiting for its form; `draftPinForm` opens in a popup over it. */
  draftPin?: { lat: number; lng: number } | null;
  draftPinForm?: ReactNode;
  onDiscardDraftPin?: () => void;
  className?: string;
}

interface MapHandles {
  map: L.Map;
  buildings: L.LayerGroup;
  draft: L.LayerGroup;
  places: L.LayerGroup;
  draftPin: L.LayerGroup;
}

// The latest value of a prop, read at event time, so a new identity never rebuilds layers.
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;

  return ref;
}

function useCampusLeaflet(
  containerRef: RefObject<HTMLDivElement | null>,
  onEmptyClick: () => void,
) {
  const [handles, setHandles] = useState<MapHandles | null>(null);
  const onEmpty = useLatest(onEmptyClick);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    const { map, dispose } = createCampusMap(containerRef.current);
    // Building clicks stop propagation (BuildingsLayer), so this is a click on empty map.
    map.on("click", () => {
      onEmpty.current();
    });
    setHandles({
      map,
      buildings: L.layerGroup().addTo(map),
      draft: L.layerGroup().addTo(map),
      places: L.layerGroup().addTo(map),
      draftPin: L.layerGroup().addTo(map),
    });

    return () => {
      dispose();
      setHandles(null);
    };
  }, [containerRef, onEmpty]);

  return handles;
}

function useRectangleTool(handles: MapHandles | null, props: CampusBuildingsMapProps) {
  const latest = useLatest(props);
  // The pin tool and the rectangle tool never share the mouse: pinning wins.
  const drawing = props.drawing === true && props.pinning !== true;

  useEffect(() => {
    if (handles === null || !drawing) {
      return;
    }

    return startRectangleTool(handles.map, {
      onDrawn: (outline) => latest.current.onDrawn?.(outline),
      onExit: () => latest.current.onExitDrawing?.(),
    });
  }, [handles, drawing, latest]);
}

function usePinTool(handles: MapHandles | null, props: CampusBuildingsMapProps) {
  const latest = useLatest(props);
  const pinning = props.pinning === true;

  useEffect(() => {
    if (handles === null || !pinning) {
      return;
    }

    return startPlacePinTool(
      handles.map,
      ({ lat, lng }) => latest.current.onPinned?.({ lat, lng }),
      () => latest.current.onExitPinning?.(),
    );
  }, [handles, pinning, latest]);
}

const toLatLngs = (outline: [number, number][]): L.LatLngTuple[] =>
  outline.map(([lon, lat]): L.LatLngTuple => [lat, lon]);

// Room between the popup and the shape it belongs to, past Leaflet's own tip.
const POPUP_GAP_PX = 12;

// Leaflet opens a popup above its anchor and pans the map to show it, but the campus map cannot
// pan past the campus edge: a shape near the top got a popup cut off by the map's border. Open
// above the shape; if that does not fit, flip below it (with no tip, which would point the
// wrong way).
function placeBesideShape(popup: L.Popup, map: L.Map, bounds: L.LatLngBounds): void {
  const element = popup.getElement();
  if (element === undefined) {
    return;
  }
  const mapTop = map.getContainer().getBoundingClientRect().top;
  if (element.getBoundingClientRect().top >= mapTop) {
    return;
  }
  popup.options.offset = L.point(0, element.offsetHeight + POPUP_GAP_PX);
  element.classList.add("popup-below");
  popup.setLatLng(L.latLng(bounds.getSouth(), bounds.getCenter().lng));
}

// One detached node per anchored thing (a draft, a selected building) for React to portal into,
// before Leaflet ever sees it.
function usePopupBody(key: string | null) {
  const [popupBody, setPopupBody] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (key === null) {
      return;
    }
    setPopupBody(document.createElement("div"));

    return () => {
      setPopupBody(null);
    };
  }, [key]);

  return popupBody;
}

interface AnchoredPopup {
  map: L.Map | null;
  /** What the popup belongs to; a new key is a new popup. Null closes it. */
  key: string | null;
  bounds: L.LatLngBounds | null;
  /** The manager closed it (its ×, or Escape). */
  onDismiss: () => void;
  /** Focus the first field (a form popup). */
  autofocus: boolean;
  /** A short read-only card (not a form): narrower, with tighter spacing (index.css). */
  compact: boolean;
  /** Pixels the popup rises above its anchor: a pin's body stands above the point it marks. */
  riseAbove?: number;
}

// A layout effect, so it runs once React has already filled the body: Leaflet then measures the
// whole content and pans the map to show it. Never call popup.update() afterwards: Leaflet
// re-attaches the body and the focused field loses focus.
function useAnchoredPopup({
  map,
  key,
  bounds,
  onDismiss,
  autofocus,
  compact,
  riseAbove = 0,
}: AnchoredPopup) {
  const popupBody = usePopupBody(key);
  const latest = useLatest({ bounds, onDismiss });

  useLayoutEffect(() => {
    const anchor = latest.current.bounds;
    if (map === null || key === null || popupBody === null || anchor === null) {
      return;
    }
    const dismiss = () => {
      latest.current.onDismiss();
    };
    const popup = L.popup({
      closeOnClick: false,
      autoClose: false,
      minWidth: compact ? 176 : 288,
      maxWidth: compact ? 256 : 288,
      className: compact ? "popup-compact" : "",
      offset: popupOffset(riseAbove),
    })
      .setLatLng(L.latLng(anchor.getNorth(), anchor.getCenter().lng))
      .setContent(popupBody)
      .openOn(map);
    placeBesideShape(popup, map, anchor);
    popup.on("remove", dismiss);
    if (autofocus) {
      // The form mounted while detached, where autofocus cannot land: focus it now.
      popupBody.querySelector<HTMLElement>("input")?.focus();
    }

    return () => {
      popup.off("remove", dismiss);
      popup.remove();
    };
  }, [map, key, popupBody, latest, autofocus, compact, riseAbove]);

  return popupBody;
}

function useDraftShape(handles: MapHandles | null, draft: GeoPolygon | null) {
  useEffect(() => {
    if (handles === null || draft === null) {
      return;
    }
    L.polygon(toLatLngs(draft.coordinates[0] ?? []), DRAFT_RECTANGLE_STYLE).addTo(handles.draft);

    return () => {
      handles.draft.clearLayers();
    };
  }, [handles, draft]);
}

function useDraftPin(handles: MapHandles | null, draftPin: { lat: number; lng: number } | null) {
  useEffect(() => {
    if (handles === null || draftPin === null) {
      return;
    }
    L.marker([draftPin.lat, draftPin.lng], { icon: draftPinIcon(), interactive: false }).addTo(
      handles.draftPin,
    );

    return () => {
      handles.draftPin.clearLayers();
    };
  }, [handles, draftPin]);
}

// A single point as bounds of zero area: north, south and centre all fall on the point, so the
// popup logic written for shapes anchors at the pin's tip (placeBesideShape included).
const pointBounds = (lat: number, lng: number): L.LatLngBounds =>
  L.latLngBounds([lat, lng], [lat, lng]);

function boundsOf(outline: [number, number][] | undefined): L.LatLngBounds | null {
  return outline === undefined || outline.length === 0 ? null : L.latLngBounds(toLatLngs(outline));
}

/** The campus with every building that has an outline. Clicking one selects it (its card opens
 * in a popup over it); clicking the empty map clears the selection. With the rectangle tool on, a
 * drag draws a rectangle and `draftForm` opens in a popup over it.
 * @example <CampusBuildingsMap buildings={b} selectedId={id} onSelect={setId} selectedCard={c} /> */
export function CampusBuildingsMap(props: CampusBuildingsMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const latest = useLatest(props);
  const handles = useCampusLeaflet(containerRef, () => {
    // While drawing, the mouse belongs to the rectangle tool.
    if (latest.current.drawing !== true && latest.current.pinning !== true) {
      latest.current.onSelect(null);
    }
  });
  useRectangleTool(handles, props);
  usePinTool(handles, props);
  const { draft = null, selectedId, buildings, places = [], selectedPlaceId = null } = props;
  const { draftPin = null } = props;
  useDraftShape(handles, draft);
  useDraftPin(handles, draftPin);
  const selectedPlace = places.find((place) => place.id === selectedPlaceId);
  const selected = buildings.find((building) => building.id === selectedId);
  const cardBody = useAnchoredPopup({
    map: handles?.map ?? null,
    key: selected === undefined || props.selectedCard === undefined ? null : selected.id,
    bounds: boundsOf(selected?.outline),
    onDismiss: () => {
      latest.current.onSelect(null);
    },
    autofocus: false,
    compact: true,
  });
  const placeBody = useAnchoredPopup({
    map: handles?.map ?? null,
    // Keyed by position too: a moved place re-anchors its popup (see placePopupKey).
    key:
      selectedPlace === undefined || props.selectedPlaceCard === undefined
        ? null
        : placePopupKey(selectedPlace),
    bounds:
      selectedPlace === undefined
        ? null
        : pointBounds(selectedPlace.latitude, selectedPlace.longitude),
    onDismiss: () => {
      latest.current.onSelectPlace?.(null);
    },
    autofocus: false,
    compact: true,
    riseAbove: PIN_HEIGHT,
  });
  const draftPinBody = useAnchoredPopup({
    map: handles?.map ?? null,
    key: draftPin === null || props.draftPinForm === undefined ? null : JSON.stringify(draftPin),
    bounds: draftPin === null ? null : pointBounds(draftPin.lat, draftPin.lng),
    onDismiss: () => latest.current.onDiscardDraftPin?.(),
    autofocus: true,
    compact: false,
    riseAbove: PIN_HEIGHT,
  });
  const draftBody = useAnchoredPopup({
    map: handles?.map ?? null,
    key: draft === null ? null : JSON.stringify(draft.coordinates),
    bounds: boundsOf(draft?.coordinates[0]),
    onDismiss: () => latest.current.onDiscardDraft?.(),
    autofocus: true,
    compact: false,
  });

  useEffect(() => {
    if (handles !== null) {
      drawBuildings(handles.buildings, buildings, selectedId, (id) => {
        latest.current.onSelect(id);
      });
    }
  }, [handles, buildings, selectedId, latest]);

  useEffect(() => {
    if (handles !== null) {
      drawPlaces(handles.places, places, selectedPlaceId, (id) => {
        latest.current.onSelectPlace?.(id);
      });
    }
  }, [handles, places, selectedPlaceId, latest]);

  return (
    <>
      <div
        ref={containerRef}
        role="region"
        aria-label={t("buildingsMapLabel")}
        className={cn(
          "isolate h-[min(66vh,44rem)] min-h-[22rem] w-full rounded-md border",
          props.className,
        )}
      />
      {cardBody !== null && createPortal(props.selectedCard, cardBody)}
      {placeBody !== null && createPortal(props.selectedPlaceCard, placeBody)}
      {draftPinBody !== null && createPortal(props.draftPinForm, draftPinBody)}
      {draftBody !== null && createPortal(props.draftForm, draftBody)}
    </>
  );
}
