import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlaceSummaryCard } from "@/components/buildings/PlaceSummaryCard";

describe("PlaceSummaryCard", () => {
  it("shows the name and how many services the place has", () => {
    render(<PlaceSummaryCard name="Ponto de ônibus" servicesCount={2} />);

    expect(screen.getByText("Ponto de ônibus")).toBeInTheDocument();
    expect(screen.getByText("2 serviços")).toBeInTheDocument();
  });

  it("uses the singular for one service", () => {
    render(<PlaceSummaryCard name="Ponto de ônibus" servicesCount={1} />);

    expect(screen.getByText("1 serviço")).toBeInTheDocument();
  });

  it("calls onEdit from the pencil", async () => {
    const onEdit = vi.fn();
    render(<PlaceSummaryCard name="Ponto de ônibus" servicesCount={2} onEdit={onEdit} />);

    await userEvent.click(screen.getByRole("button", { name: "Editar Ponto de ônibus" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("has no pencil without onEdit", () => {
    render(<PlaceSummaryCard name="Ponto de ônibus" servicesCount={2} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
