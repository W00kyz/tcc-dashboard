import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toLocalIsoDate } from "@/lib/dates";

// The bug this pins only shows in a zone behind UTC, so force one. vitest's stubEnv on TZ
// resets the process timezone, so the faked clock below is read as São Paulo wall-clock.
describe("toLocalIsoDate", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "America/Sao_Paulo"); // UTC-3, no DST
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns the local calendar day, not the UTC day, near midnight in UTC-3", () => {
    // 2026-09-01 23:30 in São Paulo is already 2026-09-02 in UTC. The default board filter
    // must still say "today = 2026-09-01" for that user.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T02:30:00Z"));

    expect(toLocalIsoDate()).toBe("2026-09-01");
  });

  it("formats an explicit Date with zero-padded month and day", () => {
    expect(toLocalIsoDate(new Date("2026-03-05T12:00:00-03:00"))).toBe("2026-03-05");
  });
});
