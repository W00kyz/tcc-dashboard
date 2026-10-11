import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { authAwareFetch } from "@/api/authFetch";
import { apiBaseUrl } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { useTranslation } from "@/i18n/useTranslation";

type ExecutionEvidence = components["schemas"]["ExecutionEvidence"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface PhotoResource {
  objectUrl: string | undefined;
  isError: boolean;
}

// The `<img>` element cannot carry the bearer header, so the authed `fetch` pulls the bytes and
// React Query caches the immutable `Blob` (never the object URL — see below). Each hook instance
// then mints its OWN `blob:` URL from that Blob in an effect and revokes exactly that URL on
// cleanup, so a thumbnail and the lightbox showing the same photo never revoke each other's URL,
// and a result fetched after the drawer closed is never turned into an unobserved, leaked URL.
function usePhotoResource(contentUrl: string, token: string): PhotoResource {
  const query = useQuery({
    queryKey: ["evidence-blob", contentUrl],
    // Evidence bytes are immutable; skip the refetch-on-focus churn that would swap the Blob.
    staleTime: Infinity,
    queryFn: async (): Promise<Blob> => {
      const response = await authAwareFetch(`${apiBaseUrl}${contentUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(
          `GET ${contentUrl} failed with status ${String(response.status)}; expected image bytes.`,
        );
      }

      return response.blob();
    },
  });

  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    const blob = query.data;
    if (blob === undefined) {
      setObjectUrl(undefined);

      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [query.data]);

  return { objectUrl, isError: query.isError };
}

function PhotoState({ resource }: { resource: PhotoResource }) {
  const { t } = useTranslation();

  return (
    <span className="text-muted-foreground flex h-24 items-center justify-center px-2 text-center text-xs">
      {resource.isError ? t("evidencePhotoError") : t("evidencePhotoLoading")}
    </span>
  );
}

interface PhotoThumbnailProps {
  item: ExecutionEvidence;
  token: string;
  onOpen: () => void;
}

function PhotoThumbnail({ item, token, onOpen }: PhotoThumbnailProps) {
  const { t } = useTranslation();
  const resource = usePhotoResource(item.content_url ?? "", token);

  return (
    <li>
      <button
        type="button"
        className="border-input block w-full overflow-hidden rounded-md border"
        onClick={onOpen}
      >
        {resource.objectUrl === undefined ? (
          <PhotoState resource={resource} />
        ) : (
          <img
            src={resource.objectUrl}
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
  const resource = usePhotoResource(current?.content_url ?? "", token);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
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
      {resource.objectUrl === undefined ? (
        <span className="text-sm text-white">
          {resource.isError ? t("evidencePhotoError") : t("evidencePhotoLoading")}
        </span>
      ) : (
        <img
          src={resource.objectUrl}
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
  // Lets the drawer suppress its own Escape-to-close handler while the lightbox owns Escape.
  onLightboxOpenChange?: (open: boolean) => void;
}

export function EvidenceViewer({ items, onLightboxOpenChange }: EvidenceViewerProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    onLightboxOpenChange?.(lightboxIndex !== null);
  }, [lightboxIndex, onLightboxOpenChange]);

  // Unmounting the viewer (drawer closed, detail refetching) closes the lightbox too — tell the
  // drawer so its Escape handler is not left permanently suppressed.
  useEffect(() => {
    return () => {
      onLightboxOpenChange?.(false);
    };
  }, [onLightboxOpenChange]);

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
