import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import { splitEvidenceByAnswers } from "@/components/execution/mediaAnswers";

type AnswerOut = components["schemas"]["AnswerOut"];
type ExecutionEvidence = components["schemas"]["ExecutionEvidence"];

function photo(id: string, key: string | null): ExecutionEvidence {
  return {
    id,
    kind: "PHOTO",
    text_body: null,
    content_type: "image/jpeg",
    byte_size: 10,
    captured_at: "2026-10-19T12:00:00Z",
    created_at: "2026-10-19T12:00:01Z",
    content_url: `/evidence/${id}/content`,
    idempotency_key: key,
  };
}

function media(stableKey: string, keys: string[]): AnswerOut {
  return { question_stable_key: stableKey, prompt: "Foto", value: keys, question_type: "MEDIA" };
}

describe("splitEvidenceByAnswers", () => {
  it("puts each photo under the question that lists it and leaves the rest loose", () => {
    const [a, b, loose] = [photo("e1", "k1"), photo("e2", "k2"), photo("e3", "k3")];

    const split = splitEvidenceByAnswers([media("q1", ["k1", "k2"])], [a, b, loose]);

    expect(split.byQuestion.get("q1")).toEqual({ photos: [a, b], missing: 0 });
    expect(split.loose).toEqual([loose]);
  });

  it("counts a listed photo that never arrived as missing", () => {
    const split = splitEvidenceByAnswers([media("q1", ["k1", "gone"])], [photo("e1", "k1")]);

    expect(split.byQuestion.get("q1")?.missing).toBe(1);
  });

  it("ignores answers of other types and values that are not key lists", () => {
    const text: AnswerOut = {
      question_stable_key: "q2",
      prompt: "Obs",
      value: "k1",
      question_type: "TEXT",
    };
    const broken: AnswerOut = { ...media("q3", []), value: "not-a-list" };
    const evidence = [photo("e1", "k1")];

    const split = splitEvidenceByAnswers([text, broken], evidence);

    expect(split.byQuestion.has("q2")).toBe(false);
    expect(split.byQuestion.get("q3")).toEqual({ photos: [], missing: 0 });
    expect(split.loose).toEqual(evidence);
  });
});
