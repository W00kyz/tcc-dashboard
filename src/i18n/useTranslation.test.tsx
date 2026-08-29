import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTranslation } from "@/i18n/useTranslation";

describe("useTranslation", () => {
  it("resolves a known key to its Portuguese string", () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t("loginSubmit")).toBe("Entrar");
  });
});
