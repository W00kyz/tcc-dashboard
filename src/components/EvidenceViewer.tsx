import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiBaseUrl } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { useTranslation } from "@/i18n/useTranslation";

type ExecutionEvidence = components["schemas"]["ExecutionEvidence"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// The `<img>` element cannot carry the bearer header, so each photo is fetched through the
// authed `fetch` into a `blob:` URL and that object URL is revoked when the thumbnail unmounts
// (React Query keeps the entry only while it is mounted here — `gcTime: 0`).
function usePhotoObjectUrl(contentUrl: string, token: string): string | undefined {
  const query = useQuery({
    queryKey: ["evidence-blob", contentUrl],
    gcTime: 0,
    queryFn: async () => {
      const response = await fetch(`${apiBaseUrl}${contentUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(
          `GET ${contentUrl} failed with status ${String(response.status)}; expected image bytes.`,
        );
      }

      return URL.createObjectURL(await response.blob());
    },
  });

  useEffect(() => {
    const url = query.data;

    return () => {
      if (url !== undefined) {
        URL.revokeObjectURL(url);
      }
    };
  }, [query.data]);

  return query.data;
}

interface PhotoThumbnailProps {
  item: ExecutionEvidence;
  token: string;
  onOpen: () => void;
}

function PhotoThumbnail({ item, token, onOpen }: PhotoThumbnailProps) {
  const { t } = useTranslation();
  const objectUrl = usePhotoObjectUrl(item.content_url ?? "", token);

  return (
    <li>
      <button
        type="button"
        className="border-input block w-full overflow-hidden rounded-md border"
        onClick={onOpen}
      >
        {objectUrl === undefined ? (
          <span className="text-muted-foreground flex h-24 items-center justify-center text-xs">
            {t("evidencePhotoLoading")}
          </span>
        ) : (
          <img
            src={objectUrl}
            alt={t("evidencePhotoAlt")}
            loading="lazy"
            className="h-24 w-full object-cover"
          />
        )}
      </button>
      <span className="text-muted-foreground mt-1 block text-xs">
        {formatDateTime(item.captured_at)}
      </span>
    </li>
  );
}

interface LightboxProps {
  photos: ExecutionEvidence[];
  index: number;
  token: string;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}

function Lightbox({ photos, index, token, onIndexChange, onClose }: LightboxProps) {
  const { t } = useTranslation();
  const current = photos[index];
  const objectUrl = usePhotoObjectUrl(current?.content_url ?? "", token);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stop the drawer's own Escape listener from also firing: close the lightbox only.
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key === "ArrowLeft" && index > 0) {
        onIndexChange(index - 1);
      } else if (event.key === "ArrowRight" && index < photos.length - 1) {
        onIndexChange(index + 1);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [index, photos.length, onIndexChange, onClose]);

  return (
    <div
      role="dialog"
      aria-label={t("evidenceLightboxTitle")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label={t("evidenceLightboxClose")}
        className="absolute top-4 right-4 text-2xl text-white"
        onClick={onClose}
      >
        ×
      </button>
      <button
        type="button"
        aria-label={t("evidenceLightboxPrev")}
        className="absolute left-4 text-3xl text-white disabled:opacity-30"
        disabled={index <= 0}
        onClick={(event) => {
          event.stopPropagation();
          onIndexChange(index - 1);
        }}
      >
        ◀
      </button>
      {objectUrl !== undefined && (
        <img
          src={objectUrl}
          alt={t("evidencePhotoAlt")}
          className="max-h-full max-w-full object-contain"
          onClick={(event) => {
            event.stopPropagation();
          }}
        />
      )}
      <button
        type="button"
        aria-label={t("evidenceLightboxNext")}
        className="absolute right-4 text-3xl text-white disabled:opacity-30"
        disabled={index >= photos.length - 1}
        onClick={(event) => {
          event.stopPropagation();
          onIndexChange(index + 1);
        }}
      >
        ▶
      </button>
    </div>
  );
}

interface EvidenceViewerProps {
  items: ExecutionEvidence[];
}

export function EvidenceViewer({ items }: EvidenceViewerProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (items.length === 0) {
    return null;
  }

  const photos = items.filter((item) => item.kind === "PHOTO" && item.content_url !== null);
  const notes = items.filter((item) => item.kind === "NOTE");

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="border-input rounded-md border p-3 text-sm">
          <p className="whitespace-pre-wrap">{note.text_body}</p>
          <span className="text-muted-foreground mt-1 block text-xs">
            {t("evidenceNoteLabel")} · {formatDateTime(note.captured_at)}
          </span>
        </div>
      ))}

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, photoIndex) => (
            <PhotoThumbnail
              key={photo.id}
              item={photo}
              token={token}
              onOpen={() => {
                setLightboxIndex(photoIndex);
              }}
            />
          ))}
        </ul>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          token={token}
          onIndexChange={setLightboxIndex}
          onClose={() => {
            setLightboxIndex(null);
          }}
        />
      )}
    </div>
  );
}
