import { describe, expect, it } from "vitest";

import { formValuesFrom, settingsBodyFrom, settingsSchema } from "@/lib/settingsForm";

const SETTINGS = {
  check_radius_meters: 50,
  alert_scan_interval_seconds: 60,
  position_report_interval_seconds: 30,
  no_evidence_grace_min: 30,
  allocation_batch_size: 4,
  campus_min_lat: -7.225,
  campus_max_lat: -7.205,
  campus_min_lng: -35.92,
  campus_max_lng: -35.898,
  outside_campus_release_minutes: 10,
  location_silence_warning_minutes: 30,
  location_silence_release_minutes: 45,
  workday_start_time: "07:00:00",
  workday_end_time: "17:00:00",
  service_weekdays: [0, 1, 2, 3, 4],
  appeal_window_hours: 48,
  updated_at: "2026-09-01T00:00:00Z",
};

describe("settingsForm", () => {
  it("seeds the time input with HH:MM and leaves updated_at out", () => {
    const values = formValuesFrom(SETTINGS);

    expect(values.workday_start_time).toBe("07:00");
    expect(values.workday_end_time).toBe("17:00");
    expect(values).not.toHaveProperty("updated_at");
  });

  it("sends the start and end times with seconds and the weekdays in calendar order", () => {
    const body = settingsBodyFrom({
      ...formValuesFrom(SETTINGS),
      workday_end_time: "16:30",
      service_weekdays: [5, 0, 2],
    });

    expect(body).toMatchObject({
      workday_start_time: "07:00:00",
      workday_end_time: "16:30:00",
      service_weekdays: [0, 2, 5],
    });
  });

  it("accepts the stored defaults", () => {
    expect(settingsSchema.safeParse(formValuesFrom(SETTINGS)).success).toBe(true);
  });

  it("requires the workday start", () => {
    const result = settingsSchema.safeParse({
      ...formValuesFrom(SETTINGS),
      workday_start_time: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Informe o horário de início do expediente.");
  });

  it("requires the workday to start before it ends", () => {
    const result = settingsSchema.safeParse({
      ...formValuesFrom(SETTINGS),
      workday_start_time: "17:00",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("O início do expediente deve ser antes do fim.");
  });
});
