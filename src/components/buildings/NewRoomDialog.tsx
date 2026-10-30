import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import { useApiClient, useRefreshRooms } from "@/components/buildings/useBuildingRecords";
import { Field, RegistryNewButton } from "@/components/layout/Registry";
import { assertSaved } from "@/components/layout/registryForm";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type FloorOut = components["schemas"]["FloorOut"];
type RoomOut = components["schemas"]["RoomOut"];
type RoomCreateOut = components["schemas"]["RoomCreateOut"];

export type RoomCleaning = RoomCreateOut["cleaning"];

const MAX_NUMBERED_ROOMS = 99;

/** The number the next unnamed room of the floor takes: the floor's hundred (Térreo 100, andar 1
 * 200…) plus one past the highest number in use. Display only — the backend allocates the real
 * one, so a race between two managers can still land on a different number.
 * Empty once the floor has its 99 numbered rooms: the backend answers 409 until a name is typed.
 * @example suggestRoomName({ level: 0 }, [{ name: "101" }]) // "102" */
export function suggestRoomName(floor: Pick<FloorOut, "level">, rooms: RoomOut[]): string {
  const base = (floor.level + 1) * 100;
  const used = rooms
    .filter((room) => /^\d+$/.test(room.name))
    .map((room) => Number(room.name) - base)
    .filter((offset) => offset >= 1 && offset <= MAX_NUMBERED_ROOMS);

  const highest = Math.max(0, ...used);

  return highest >= MAX_NUMBERED_ROOMS ? "" : String(base + highest + 1);
}

const ROOM_LIMIT_REACHED = "ROOM_LIMIT_REACHED";

class RoomLimitReachedError extends Error {
  constructor() {
    super("POST /rooms refused: the floor has no default room number left.");
    this.name = "RoomLimitReachedError";
  }
}

// The API answers a full floor with {"detail": {"code": "ROOM_LIMIT_REACHED"}}; a duplicate name
// is a 409 too, with a plain-text detail.
function isRoomLimitReached(error: unknown): boolean {
  const detail = (error as { detail?: { code?: string } } | undefined)?.detail;

  return typeof detail === "object" && detail.code === ROOM_LIMIT_REACHED;
}

function useCreateRoom(floor: FloorOut, onCreated: (cleaning: RoomCleaning) => void) {
  const client = useApiClient();
  const refresh = useRefreshRooms();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [withCleaning, setWithCleaning] = useState(true);
  const save = useMutation({
    mutationFn: async () => {
      const typed = name.trim();
      const { data, error, response } = await client.POST("/rooms", {
        // Blank means "number it for me": no name key at all.
        body: { floor_id: floor.id, with_cleaning: withCleaning, ...(typed && { name: typed }) },
      });
      if (response.status === 409 && isRoomLimitReached(error)) {
        throw new RoomLimitReachedError();
      }
      assertSaved(response, "POST /rooms");

      return data as RoomCreateOut;
    },
    onSuccess: (room) => {
      setOpen(false);
      refresh();
      onCreated(room.cleaning);
    },
  });

  return {
    open,
    name,
    withCleaning,
    save,
    setName,
    setWithCleaning,
    setOpen: (next: boolean) => {
      setName("");
      setWithCleaning(true);
      save.reset();
      setOpen(next);
    },
  };
}

interface NewRoomDialogProps {
  floor: FloorOut;
  /** The floor's rooms, to suggest the next number. */
  rooms: RoomOut[];
  /** Called once the room exists, with what became of its Limpeza point. */
  onCreated: (cleaning: RoomCleaning) => void;
}

/** "Nova sala" and its Dialog: an optional name (blank = the next number) and whether the room
 * gets its Limpeza point.
 * @example <NewRoomDialog floor={floor} rooms={floorRooms} onCreated={showNotice} /> */
export function NewRoomDialog({ floor, rooms, onCreated }: NewRoomDialogProps) {
  const { t } = useTranslation();
  const room = useCreateRoom(floor, onCreated);

  return (
    <>
      <RegistryNewButton
        label={t("roomsNew")}
        onClick={() => {
          room.setOpen(true);
        }}
      />
      <Dialog open={room.open} onOpenChange={room.setOpen}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              room.save.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("roomsNew")}</DialogTitle>
            </DialogHeader>
            <Field>
              <Label htmlFor="room-name">{t("roomsFieldName")}</Label>
              <Input
                id="room-name"
                value={room.name}
                placeholder={suggestRoomName(floor, rooms)}
                onChange={(event) => {
                  room.setName(event.target.value);
                }}
              />
            </Field>
            <Label className="font-normal">
              <input
                type="checkbox"
                checked={room.withCleaning}
                onChange={(event) => {
                  room.setWithCleaning(event.target.checked);
                }}
              />
              {t("roomsFieldCleaning")}
            </Label>
            {room.save.isError && (
              <ErrorMessage>
                {room.save.error instanceof RoomLimitReachedError
                  ? t("roomsLimitReached")
                  : t("roomsCreateError")}
              </ErrorMessage>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  room.setOpen(false);
                }}
              >
                {t("registryDialogCancel")}
              </Button>
              <Button type="submit" disabled={room.save.isPending}>
                {t("servicePointsSubmitCreate")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
