import { describe, expect, it } from "vitest";

import { strings, type StringKey } from "@/i18n/strings";
import { formatAge } from "@/lib/positionAge";

const t = (key: StringKey): string => strings[key];

describe("formatAge", () => {
  it("says 'agora' under a minute, then minutes, then whole hours", () => {
    expect(formatAge(30, t)).toBe("agora");
    expect(formatAge(300, t)).toBe("há 5 min");
    expect(formatAge(7200, t)).toBe("há 2 h");
  });
});
