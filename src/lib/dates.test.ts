import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatIsoDateBr,
  formatIsoDateLongBr,
  toLocalIsoDate,
  formatReportPeriodBr,
} from "@/lib/dates";

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

describe("formatIsoDateBr", () => {
  it("reads an API date as DD/MM/YYYY", () => {
    expect(formatIsoDateBr("2026-08-31")).toBe("31/08/2026");
  });

  it("leaves anything that is not a plain date untouched", () => {
    expect(formatIsoDateBr("amanhã")).toBe("amanhã");
  });
});

describe("formatIsoDateLongBr", () => {
  it("spells out weekday, day, month and year in pt-BR", () => {
    expect(formatIsoDateLongBr("2026-10-11")).toBe("domingo, 11 de outubro de 2026");
  });

  it("returns an empty string for a cleared date", () => {
    expect(formatIsoDateLongBr("")).toBe("");
  });
});

describe("formatReportPeriodBr", () => {
  it("shows a daily period as a pt-BR date", () => {
    expect(formatReportPeriodBr("DAILY", "2026-10-10")).toBe("10/10/2026");
  });

  it("shows a weekly period by its first day", () => {
    expect(formatReportPeriodBr("WEEKLY", "2026-10-05")).toBe("Semana de 05/10/2026");
  });

  it("shows a monthly period as month and year", () => {
    expect(formatReportPeriodBr("MONTHLY", "2026-10-01")).toBe("Outubro de 2026");
  });
});
