import { EvidenceViewer } from "@/components/EvidenceViewer";
import type { MediaAnswerPhotos as MediaAnswerPhotosData } from "@/components/execution/mediaAnswers";
import { useTranslation } from "@/i18n/useTranslation";

interface MediaAnswerPhotosProps {
  entry: MediaAnswerPhotosData;
  onLightboxOpenChange: (open: boolean) => void;
}

/** The photos a MEDIA answer lists, plus how many have not reached the server yet (an upload
 * still queued on the phone, or blocked). Opens in the same lightbox as the loose evidence.
 * @example <MediaAnswerPhotos entry={byQuestion.get(key)} onLightboxOpenChange={setOpen} /> */
export function MediaAnswerPhotos({ entry, onLightboxOpenChange }: MediaAnswerPhotosProps) {
  const { t } = useTranslation();
  const { photos, missing } = entry;
  if (photos.length === 0 && missing === 0) {
    return <p className="text-muted-foreground text-sm">{t("executionMediaNoPhotos")}</p>;
  }

  return (
    <div className="mt-1 space-y-1">
      <EvidenceViewer items={photos} onLightboxOpenChange={onLightboxOpenChange} />
      {missing > 0 && (
        <p className="text-muted-foreground text-xs">
          {missing === 1
            ? t("executionMediaPhotoMissing")
            : t("executionMediaPhotoMissingMany").replace("{n}", String(missing))}
        </p>
      )}
    </div>
  );
}
