/** A building outline: a GeoJSON Polygon with one closed ring of [longitude, latitude]
 * (backend app/domain/catalog/footprint.py). */
export interface GeoPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}
