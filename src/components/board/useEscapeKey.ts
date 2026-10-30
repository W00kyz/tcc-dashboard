import { useEffect } from "react";

// Escape is a document-level shortcut so it works wherever focus is, e.g. after a map click.
/** Runs `onEscape` on Escape from anywhere in the document, unless something already used the key. */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      // Radix menus/dialogs consume their own Escape with preventDefault; closing the panel as
      // well would drop the building when the manager only meant to dismiss a menu.
      if (event.key === "Escape" && !event.defaultPrevented) {
        onEscape();
      }
    }
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onEscape]);
}
