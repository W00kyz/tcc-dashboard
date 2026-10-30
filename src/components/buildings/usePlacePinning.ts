import { useState } from "react";

export interface PinPosition {
  lat: number;
  lng: number;
}

/** The pin tool and the point it placed: `pinning` while the next map click makes a pin, `draft`
 * from that click until the new-place Dialog is closed or saved.
 * @example const pin = usePlacePinning(); pin.toggle(); pin.place({ lat: -7.2, lng: -35.9 }); */
export function usePlacePinning() {
  const [pinning, setPinning] = useState(false);
  const [draft, setDraft] = useState<PinPosition | null>(null);

  return {
    pinning,
    draft,
    toggle: () => {
      setPinning((on) => !on);
    },
    stop: () => {
      setPinning(false);
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
