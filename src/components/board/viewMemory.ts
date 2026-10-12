export type ViewAction = "capture" | "restore" | "keep";

/** What the map must do with its remembered view when the open building changes. Only the
 * none → building edge captures and only building → none restores, so hopping from building A
 * to B keeps the view from before A, and a click on empty map with nothing open flies nowhere.
 * @example nextViewAction(null, "a") // "capture" */
export function nextViewAction(prevId: string | null, nextId: string | null): ViewAction {
  if (prevId === null && nextId !== null) {
    return "capture";
  }

  return prevId !== null && nextId === null ? "restore" : "keep";
}
