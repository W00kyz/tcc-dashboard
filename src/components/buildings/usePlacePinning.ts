import { useState } from "react";

export interface PinPosition {
  lat: number;
  lng: number;
}

/** The pin tool and the point it placed: `pinning` while the next map click makes a pin, `draft`
 * from that click until the new-place Dialog is closed or saved. `movingPlaceId` is set while the
 * same tool is moving an existing place instead: the next click is its new position.
 * @example const pin = usePlacePinning(); pin.toggle(); pin.place({ lat: -7.2, lng: -35.9 }); */
export function usePlacePinning() {
  const [pinning, setPinning] = useState(false);
  const [movingPlaceId, setMovingPlaceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PinPosition | null>(null);
  const stop = () => {
    setPinning(false);
    setMovingPlaceId(null);
  };

  return {
    pinning,
    movingPlaceId,
    draft,
    // Pressing the tool during a move gives the move up instead of starting a creation.
    toggle: () => {
      if (movingPlaceId !== null) {
        stop();

        return;
      }
      setPinning((on) => !on);
    },
    stop,
    startMove: (placeId: string) => {
      setDraft(null);
      setMovingPlaceId(placeId);
      setPinning(true);
    },
    // One pin at a time: the tool turns off and the Dialog takes over.
    place: (position: PinPosition) => {
      setPinning(false);
      setDraft(position);
    },
    discard: () => {
      setDraft(null);
    },
  };
}
