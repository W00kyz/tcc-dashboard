import type { components } from "@/api/generated/schema";

type AnswerOut = components["schemas"]["AnswerOut"];
type ExecutionEvidence = components["schemas"]["ExecutionEvidence"];

export interface MediaAnswerPhotos {
  photos: ExecutionEvidence[];
  /** Keys the answer lists whose photo is not among this execution's evidence (yet). */
  missing: number;
}

export interface EvidenceSplit {
  /** Per MEDIA question (by stable key): the photos it lists. */
  byQuestion: Map<string, MediaAnswerPhotos>;
  /** Evidence no MEDIA answer lists — the loose photos and notes. */
  loose: ExecutionEvidence[];
}

function photoKeys(answer: AnswerOut): string[] {
  const { value } = answer;

  return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
}

/**
 * Splits an execution's evidence between its MEDIA answers and the loose list. An answer lists
 * photos by their app-generated `idempotency_key`; keys are resolved only against this
 * execution's evidence, so a key that never arrived (upload still queued, or blocked) counts as
 * missing instead of breaking the answer (backend Ruling 6).
 * @example const { byQuestion, loose } = splitEvidenceByAnswers(detail.answers, detail.evidence);
 */
export function splitEvidenceByAnswers(
  answers: AnswerOut[],
  evidence: ExecutionEvidence[],
): EvidenceSplit {
  const byKey = new Map(
    evidence.flatMap((item) =>
      item.idempotency_key === null ? [] : [[item.idempotency_key, item] as const],
    ),
  );
  const listed = new Set<string>();
  const byQuestion = new Map<string, MediaAnswerPhotos>();
  for (const answer of answers.filter((candidate) => candidate.question_type === "MEDIA")) {
    const keys = photoKeys(answer);
    const photos = keys.flatMap((key) => {
      const item = byKey.get(key);

      return item === undefined ? [] : [item];
    });
    photos.forEach((item) => listed.add(item.id));
    byQuestion.set(answer.question_stable_key, { photos, missing: keys.length - photos.length });
  }

  return { byQuestion, loose: evidence.filter((item) => !listed.has(item.id)) };
}
