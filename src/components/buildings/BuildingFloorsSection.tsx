import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { authAwareFetch } from "@/api/authFetch";
import { apiBaseUrl } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useApiClient, useBuildingFloors } from "@/components/buildings/useBuildingRecords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Section } from "@/components/layout/Page";
import { Ban, FileDown, QrCode } from "lucide-react";
import { ErrorMessage, SuccessMessage } from "@/components/layout/StateMessages";
import { RegistryList, RegistryNewButton } from "@/components/layout/Registry";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";

interface QrCodeRow {
  id: string;
  floor_id: string;
  public_code: string;
  version: number;
  status: string;
}

/** The building's floors, each with its QR code actions (generate, revoke, print), and the
 * form that adds or renames one.
 * @example <BuildingFloorsSection buildingId={building.id} /> */
export function BuildingFloorsSection({ buildingId }: { buildingId: string }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = useApiClient();
  const { data: floors } = useBuildingFloors(buildingId);

  // Finding I3: downloadPdf used to ignore response.ok and blob-open whatever came back —
  // for the common case of a floor with no active QR (every new floor, every floor right
  // after a revoke) that meant opening a tab showing the raw {"detail": "..."} error body
  // instead of any indication something went wrong. This tracks the most recent failure so
  // the page can show a real message instead.
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);

  // The dialog only renames: a new floor takes the next label (Térreo, 1, 2…) from the backend.
  const dialog = useRegistryDialog({ label: "" }, ["label"]);
  const { form } = dialog;
  const refreshFloors = () => {
    // Prefix match: the board's floor lists and the point form's floor picker refresh too.
    void queryClient.invalidateQueries({ queryKey: ["floors"] });
  };
  const create = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/floors", { body: { building_id: buildingId } });
      assertSaved(response, "POST /floors");
    },
    onSuccess: refreshFloors,
  });
  const save = useMutation({
    mutationFn: async () => {
      const editingId = form.editingId;
      if (editingId === null) {
        return;
      }
      const { response } = await client.PATCH("/floors/{floor_id}", {
        params: { path: { floor_id: editingId } },
        body: { label: form.values.label.trim() },
      });
      assertSaved(response, `PATCH /floors/${editingId}`);
    },
    onSuccess: () => {
      dialog.close();
      refreshFloors();
    },
  });

  // The backend (Etapa 3 Tasks 7-8) exposes no "get the active QR code for a floor" read
  // endpoint — only issue, revoke and the PDF download. So the Revoke button can only target a
  // QR code this session itself just issued: its id comes back in the issue response and is
  // kept here per floor, not fetched. A page reload loses it, same as a fresh floor with no
  // QR issued yet — the Revoke button simply starts disabled again until Generate is used.
  const [activeQrByFloor, setActiveQrByFloor] = useState<Record<string, QrCodeRow>>({});

  const generateQr = useMutation({
    mutationFn: async ({ floorId, reason }: { floorId: string; reason: string }) => {
      const { data, response } = await client.POST("/floors/{floor_id}/qr-codes", {
        params: { path: { floor_id: floorId } },
        body: { reason },
      });
      assertSaved(response, `POST /floors/${floorId}/qr-codes`);

      return data as QrCodeRow;
    },
    onSuccess: (qrCode, { floorId }) => {
      setActiveQrByFloor((previous) => ({ ...previous, [floorId]: qrCode }));
    },
  });

  const revokeQr = useMutation({
    mutationFn: async ({
      qrCodeId,
      reason,
    }: {
      floorId: string;
      qrCodeId: string;
      reason: string;
    }) => {
      const { response } = await client.POST("/qr-codes/{qr_code_id}/revoke", {
        params: { path: { qr_code_id: qrCodeId } },
        body: { reason },
      });
      assertSaved(response, `POST /qr-codes/${qrCodeId}/revoke`);
    },
    onSuccess: (_data, { floorId }) => {
      setActiveQrByFloor((previous) => {
        const next = { ...previous };
        // `delete next[floorId]` trips @typescript-eslint/no-dynamic-delete (floorId is a
        // runtime value, not a literal key) — Reflect.deleteProperty is the sanctioned form.
        Reflect.deleteProperty(next, floorId);

        return next;
      });
    },
  });

  function handleGenerateQr(floorId: string) {
    // window.prompt returns null on Cancel — that must abort the action rather than issue a
    // QR with an empty reason.
    const reason = window.prompt(t("floorsQrReasonPrompt"));
    if (reason === null) {
      return;
    }

    generateQr.mutate({ floorId, reason });
  }

  function handleRevokeQr(floorId: string, qrCodeId: string) {
    const reason = window.prompt(t("floorsRevokeReasonPrompt"));
    if (reason === null) {
      return;
    }

    revokeQr.mutate({ floorId, qrCodeId, reason });
  }

  async function downloadPdf(floorId: string) {
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
    <Section
      title={t("floorsSectionTitle")}
      titleId="building-floors-heading"
      actions={
        <RegistryNewButton
          label={t("floorsNew")}
          onClick={() => {
            create.mutate();
          }}
        />
      }
    >
      {create.isError && <ErrorMessage>{t("floorsCreateError")}</ErrorMessage>}
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
      <RegistryList
        items={floors}
        getKey={(floor) => floor.id}
        renderItem={(floor) => {
          const activeQr = activeQrByFloor[floor.id];

          return (
            <>
              <span className="text-foreground min-w-0 flex-1 font-semibold">{floor.label}</span>
              <RegistryEditButton
                itemName={floor.label}
                onEdit={() => {
                  save.reset();
                  dialog.openEdit(floor.id, { label: floor.label });
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleGenerateQr(floor.id);
                  }}
                >
                  <QrCode aria-hidden="true" />
                  {t("floorsGenerateQr")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={activeQr === undefined}
                  onClick={() => {
                    if (activeQr === undefined) {
                      return;
                    }

                    handleRevokeQr(floor.id, activeQr.id);
                  }}
                >
                  <Ban aria-hidden="true" />
                  {t("floorsRevokeQr")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void downloadPdf(floor.id);
                  }}
                >
                  <FileDown aria-hidden="true" />
                  {t("floorsDownloadPdf")}
                </Button>
              </div>
            </>
          );
        }}
      />
      <RegistryDialog
        dialog={dialog}
        save={save}
        createLabel={t("registrySubmitEdit")}
        fieldLabels={{ label: t("floorsFieldLabel") }}
        onSubmit={() => {
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="floor-label">{t("floorsFieldLabel")}</Label>
          <Input
            id="floor-label"
            value={form.values.label}
            aria-invalid={form.isInvalid("label")}
            onChange={(event) => {
              form.setField("label", event.target.value);
            }}
          />
        </div>
      </RegistryDialog>
    </Section>
  );
}
