import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  blankDraft,
  draftFromType,
  type ServiceTypeDraft,
  toServiceTypeRows,
} from "@/components/companies/serviceTypeRows";
import { ServiceTypeRows } from "@/components/companies/ServiceTypeRows";

type Rows = ReturnType<typeof toServiceTypeRows>;

function Harness({
  initial,
  onSave,
}: {
  initial: ServiceTypeDraft[];
  onSave: (rows: Rows) => void;
}) {
  const [drafts, setDrafts] = useState(initial);

  return (
    <>
      <ServiceTypeRows drafts={drafts} onChange={setDrafts} orphans={[]} showInvalid={false} />
      <button
        type="button"
        onClick={() => {
          onSave(toServiceTypeRows(drafts));
        }}
      >
        Salvar
      </button>
    </>
  );
}

describe("ServiceTypeRows", () => {
  it("ticking Exige evidências puts requires_evidence: true in the saved payload", async () => {
    const onSave = vi.fn<(rows: Rows) => void>();
    render(<Harness initial={[{ ...blankDraft(), name: "Limpeza" }]} onSave={onSave} />);

    const checkbox = screen.getByRole("checkbox", { name: "Exige evidências" });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSave).toHaveBeenCalledWith([
      { id: null, name: "Limpeza", average_duration_minutes: 30, requires_evidence: true },
    ]);
  });

  it("shows an existing type already ticked and can untick it", async () => {
    const onSave = vi.fn<(rows: Rows) => void>();
    const draft = draftFromType({
      id: "t1",
      name: "Limpeza",
      average_duration_minutes: 30,
      requires_evidence: true,
    });
    render(<Harness initial={[draft]} onSave={onSave} />);

    const checkbox = screen.getByRole("checkbox", { name: "Exige evidências" });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSave.mock.calls[0]?.[0][0]?.requires_evidence).toBe(false);
  });
});
