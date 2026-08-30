import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

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
    const response = await fetch(`${apiBaseUrl}/floors/${floorId}/qr-codes/active/pdf`, {
      headers: { Authorization: `Bearer ${session?.accessToken ?? ""}` },
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("floorsPageTitle")}</h1>
      <form
        className="flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex-1">
          <Label htmlFor="floor-label">{t("floorsFieldLabel")}</Label>
          <Input
            id="floor-label"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
        </div>
        <Button type="submit">{t("floorsSubmitCreate")}</Button>
      </form>
      <ul className="divide-border divide-y">
        {floors?.map((floor) => {
          const activeQr = activeQrByFloor[floor.id];

          return (
            <li key={floor.id} className="flex items-center justify-between py-2">
              <span>{floor.label}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    handleGenerateQr(floor.id);
                  }}
                >
                  {t("floorsGenerateQr")}
                </Button>
                <Button
                  variant="outline"
                  disabled={activeQr === undefined}
                  onClick={() => {
                    if (activeQr === undefined) {
                      return;
                    }

                    handleRevokeQr(floor.id, activeQr.id);
                  }}
                >
                  {t("floorsRevokeQr")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void downloadPdf(floor.id);
                  }}
                >
                  {t("floorsDownloadPdf")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
