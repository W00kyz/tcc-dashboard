import { useMutation } from "@tanstack/react-query";
import { Ban, FileDown, QrCode } from "lucide-react";
import { useState } from "react";

import { authAwareFetch } from "@/api/authFetch";
import { apiBaseUrl } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useApiClient } from "@/components/buildings/useBuildingRecords";
import { ErrorMessage, SuccessMessage } from "@/components/layout/StateMessages";
import { assertSaved } from "@/components/layout/registryForm";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";

interface QrCodeRow {
  id: string;
  floor_id: string;
  public_code: string;
  version: number;
  status: string;
}

/** The QR code actions of one floor: generate, revoke and open the PDF, each with its message.
 * @example <FloorQrActions floorId={floor.id} /> */
export function FloorQrActions({ floorId }: { floorId: string }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const client = useApiClient();

  // Finding I3: downloadPdf used to ignore response.ok and blob-open whatever came back —
  // for the common case of a floor with no active QR (every new floor, every floor right
  // after a revoke) that meant opening a tab showing the raw {"detail": "..."} error body
  // instead of any indication something went wrong. This tracks the most recent failure so
  // the page can show a real message instead.
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);

  // The backend (Etapa 3 Tasks 7-8) exposes no "get the active QR code for a floor" read
  // endpoint — only issue, revoke and the PDF download. So the Revoke button can only target a
  // QR code this session itself just issued: its id comes back in the issue response and is
  // kept here, not fetched. A page reload loses it, same as a fresh floor with no QR issued
  // yet — the Revoke button simply starts disabled again until Generate is used.
  const [activeQr, setActiveQr] = useState<QrCodeRow | null>(null);

  const generateQr = useMutation({
    mutationFn: async (reason: string) => {
      const { data, response } = await client.POST("/floors/{floor_id}/qr-codes", {
        params: { path: { floor_id: floorId } },
        body: { reason },
      });
      assertSaved(response, `POST /floors/${floorId}/qr-codes`);

      return data as QrCodeRow;
    },
    onSuccess: setActiveQr,
  });

  const revokeQr = useMutation({
    mutationFn: async ({ qrCodeId, reason }: { qrCodeId: string; reason: string }) => {
      const { response } = await client.POST("/qr-codes/{qr_code_id}/revoke", {
        params: { path: { qr_code_id: qrCodeId } },
        body: { reason },
      });
      assertSaved(response, `POST /qr-codes/${qrCodeId}/revoke`);
    },
    onSuccess: () => {
      setActiveQr(null);
    },
  });

  function handleGenerateQr() {
    // window.prompt returns null on Cancel — that must abort the action rather than issue a
    // QR with an empty reason.
    const reason = window.prompt(t("floorsQrReasonPrompt"));
    if (reason === null) {
      return;
    }

    generateQr.mutate(reason);
  }

  function handleRevokeQr(qrCodeId: string) {
    const reason = window.prompt(t("floorsRevokeReasonPrompt"));
    if (reason === null) {
      return;
    }

    revokeQr.mutate({ qrCodeId, reason });
  }

  async function downloadPdf() {
    setPdfDownloadError(null);
    const response = await authAwareFetch(`${apiBaseUrl}/floors/${floorId}/qr-codes/active/pdf`, {
      headers: { Authorization: `Bearer ${session?.accessToken ?? ""}` },
    });
    // A 404 ("no active QR for this floor") is the common case, not an edge case — every
    // freshly created floor and every floor right after a revoke hits it. Surfacing it as a
    // message instead of blob-opening the JSON error body is the whole point of this check.
    if (!response.ok) {
      setPdfDownloadError(t("floorsPdfDownloadError"));

      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // The new tab needs time to actually load the blob before its URL can safely go away;
    // revoking immediately risks a race, so this just bounds the leak instead of chasing the
    // load event of a tab this page doesn't otherwise track.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={handleGenerateQr}>
          <QrCode aria-hidden="true" />
          {t("floorsGenerateQr")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={activeQr === null}
          onClick={() => {
            if (activeQr !== null) {
              handleRevokeQr(activeQr.id);
            }
          }}
        >
          <Ban aria-hidden="true" />
          {t("floorsRevokeQr")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void downloadPdf();
          }}
        >
          <FileDown aria-hidden="true" />
          {t("floorsDownloadPdf")}
        </Button>
      </div>
      {pdfDownloadError !== null && <ErrorMessage>{pdfDownloadError}</ErrorMessage>}
      {/* The generate/revoke buttons used to give no sign that anything happened. */}
      {generateQr.isSuccess && (
        <SuccessMessage>
          {t("floorsQrGenerated").replace("{version}", String(generateQr.data.version))}
        </SuccessMessage>
      )}
      {revokeQr.isSuccess && <SuccessMessage>{t("floorsQrRevoked")}</SuccessMessage>}
      {(generateQr.isError || revokeQr.isError) && (
        <ErrorMessage>{t("floorsQrActionError")}</ErrorMessage>
      )}
    </>
  );
}
