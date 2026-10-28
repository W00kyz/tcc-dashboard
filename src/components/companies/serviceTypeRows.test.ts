import { describe, expect, it } from "vitest";

import {
  blankDraft,
  draftFromType,
  toServiceTypeRows,
} from "@/components/companies/serviceTypeRows";

describe("serviceTypeRows requires_evidence", () => {
  it("round-trips requires_evidence: true from a type to the payload", () => {
    const draft = draftFromType({
      id: "t1",
      name: "Limpeza",
      average_duration_minutes: 30,
      requires_evidence: true,
    });

    expect(draft.requiresEvidence).toBe(true);
    expect(toServiceTypeRows([draft])).toEqual([
      { id: "t1", name: "Limpeza", average_duration_minutes: 30, requires_evidence: true },
    ]);
  });

  it("starts a blank line without the requirement", () => {
    const draft = blankDraft();

    expect(draft.requiresEvidence).toBe(false);
    expect(toServiceTypeRows([{ ...draft, name: "Nova" }])[0]?.requires_evidence).toBe(false);
  });
});
