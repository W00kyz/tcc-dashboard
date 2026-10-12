import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { authAwareFetch } from "@/api/authFetch";
import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { Ban, ChevronLeft, FileDown, QrCode } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { BuildingFootprintSection } from "@/components/buildings/BuildingFootprintSection";
import { RegistryLayout, RegistryList } from "@/components/layout/Registry";

interface FloorRow {
  id: string;
  building_id: string;
  label: string;
}

interface QrCodeRow {
  id: string;
  floor_id: string;
  public_code: string;
  version: number;
  status: string;
}

export function FloorsPage() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage/ContractorCompaniesPage/FieldWorkersPage/BuildingsPage's
  // convention: fall back to an empty token instead of asserting a non-null session, so the
  // page renders (and its requests fail cleanly) even before the session has hydrated.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: floors } = useQuery({
    queryKey: ["floors", buildingId],
    queryFn: async () => {
      const { data } = await client.GET("/floors", {
        params: { query: { building_id: buildingId } },
      });

      return data as FloorRow[];
    },
    enabled: Boolean(buildingId),
  });

  // Finding I3: downloadPdf used to ignore response.ok and blob-open whatever came back —
  // for the common case of a floor with no active QR (every new floor, every floor right
  // after a revoke) that meant opening a tab showing the raw {"detail": "..."} error body
  // instead of any indication something went wrong. This tracks the most recent failure so
  // the page can show a real message instead.
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      await client.POST("/floors", { body: { building_id: buildingId ?? "", label } });
    },
    onSuccess: () => {
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: ["floors", buildingId] });
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
      const { data } = await client.POST("/floors/{floor_id}/qr-codes", {
        params: { path: { floor_id: floorId } },
        body: { reason },
      });

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
      await client.POST("/qr-codes/{qr_code_id}/revoke", {
        params: { path: { qr_code_id: qrCodeId } },
        body: { reason },
      });
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
    <Page>
      <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
        <Link to="/predios">
          <ChevronLeft aria-hidden="true" />
          {t("floorsBackToBuildings")}
        </Link>
      </Button>
      <PageHeader title={t("floorsPageTitle")} />
      <BuildingFootprintSection buildingId={buildingId ?? ""} />
      {pdfDownloadError !== null && <ErrorMessage>{pdfDownloadError}</ErrorMessage>}
      <RegistryLayout
        list={
          <RegistryList
            items={floors}
            getKey={(floor) => floor.id}
            renderItem={(floor) => {
              const activeQr = activeQrByFloor[floor.id];

              return (
                <>
                  <span className="text-foreground min-w-0 flex-1 font-semibold">
                    {floor.label}
                  </span>
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
        }
        form={
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="floor-label">{t("floorsFieldLabel")}</Label>
              <Input
                id="floor-label"
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                }}
              />
            </div>
            <Button type="submit" className="w-full">
              {t("floorsSubmitCreate")}
            </Button>
          </form>
        }
      />
    </Page>
  );
}
