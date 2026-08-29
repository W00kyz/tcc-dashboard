import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("redirects the root path to the login screen", async () => {
    render(<App />);

    expect(await screen.findByText("PU · UFCG")).toBeInTheDocument();
  });
});
