import { Plus, Trash2 } from "lucide-react";

import type { components } from "@/api/generated/schema";
import {
  blankDraft,
  draftFromType,
  type ServiceTypeDraft,
} from "@/components/companies/serviceTypeRows";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";

type ServiceTypeOut = components["schemas"]["ServiceTypeOut"];

interface ServiceTypeRowsProps {
  drafts: ServiceTypeDraft[];
  onChange: (next: ServiceTypeDraft[]) => void;
  /** Types no company has adopted; the ones already in `drafts` are not offered again. */
  orphans: ServiceTypeOut[];
  /** Flags the lines that block the save. */
  showInvalid: boolean;
}

/** The company dialog's "Tipos de serviço": a line per type (name, average minutes, "Exige evidências", remove),
 * "Adicionar tipo" for a new one and, when some exist, a picker to adopt an orphan type.
 * @example <ServiceTypeRows drafts={rows} onChange={setRows} orphans={orphans} showInvalid={false} /> */
export function ServiceTypeRows({ drafts, onChange, orphans, showInvalid }: ServiceTypeRowsProps) {
  const { t } = useTranslation();
  const adoptable = orphans.filter((orphan) => !drafts.some((draft) => draft.id === orphan.id));
  const edit = (key: number, change: Partial<ServiceTypeDraft>) => {
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("serviceTypesHeading")}</legend>
      {drafts.map((draft, index) => {
        const position = String(index + 1);
        const nameBlank = showInvalid && draft.name.trim() === "";
        const minutesBad = showInvalid && !(Number(draft.minutes) > 0);

        return (
          <div key={draft.key} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={t("serviceTypeName").replace("{n}", position)}
              placeholder={t("contractorCompaniesFieldName")}
              value={draft.name}
              aria-invalid={nameBlank}
              onChange={(event) => {
                edit(draft.key, { name: event.target.value });
              }}
            />
            <Input
              type="number"
              min={1}
              step={1}
              className="w-24 shrink-0"
              aria-label={t("serviceTypeDuration").replace("{n}", position)}
              value={draft.minutes}
              aria-invalid={minutesBad}
              onChange={(event) => {
                edit(draft.key, { minutes: event.target.value });
              }}
            />
            <span aria-hidden="true" className="text-muted-foreground text-sm">
              {t("serviceTypeMinutesUnit")}
            </span>
            <Label className="shrink-0 font-normal">
              <Checkbox
                checked={draft.requiresEvidence}
                onCheckedChange={(checked) => {
                  edit(draft.key, { requiresEvidence: checked === true });
                }}
              />
              {t("serviceTypeRequiresEvidence")}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("serviceTypeRemove").replace("{name}", draft.name || position)}
              onClick={() => {
                onChange(drafts.filter((other) => other.key !== draft.key));
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...drafts, blankDraft()]);
          }}
        >
          <Plus aria-hidden="true" />
          {t("serviceTypeAdd")}
        </Button>
        {adoptable.length > 0 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="company-orphan-type" className="sr-only">
              {t("serviceTypeAttachOrphan")}
            </Label>
            <NativeSelect
              id="company-orphan-type"
              size="sm"
              value=""
              onChange={(event) => {
                const picked = adoptable.find((orphan) => orphan.id === event.target.value);
                if (picked !== undefined) {
                  onChange([...drafts, draftFromType(picked)]);
                }
              }}
            >
              <NativeSelectOption value="">{t("serviceTypeAttachOrphan")}</NativeSelectOption>
              {adoptable.map((orphan) => (
                <NativeSelectOption key={orphan.id} value={orphan.id}>
                  {orphan.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>
    </fieldset>
  );
}
