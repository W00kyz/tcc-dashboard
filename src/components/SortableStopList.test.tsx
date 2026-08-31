import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SortableStopList, type StopDraft } from "@/components/SortableStopList";

function makeStops(): StopDraft[] {
  return [
    {
      key: "k1",
      servicePointId: "sp1",
      servicePointName: "Sala 101",
      expectedArrivalFrom: "",
      expectedArrivalTo: "",
    },
    {
      key: "k2",
      servicePointId: "sp2",
      servicePointName: "Sala 102",
      expectedArrivalFrom: "",
      expectedArrivalTo: "",
    },
    {
      key: "k3",
      servicePointId: "sp3",
      servicePointName: "Sala 103",
      expectedArrivalFrom: "",
      expectedArrivalTo: "",
    },
  ];
}

// Drives @dnd-kit's real KeyboardSensor: focus the handle, Space to grab, Arrow to move
// one slot, Space to drop. Relies on the <li> rect stub in src/test/setup.ts.
async function keyboardReorder(
  user: ReturnType<typeof userEvent.setup>,
  handle: HTMLElement,
  arrow: "{ArrowUp}" | "{ArrowDown}",
) {
  handle.focus();
  await user.keyboard("{ }");
  await user.keyboard(arrow);
  await user.keyboard("{ }");
}

describe("SortableStopList", () => {
  it("reorders a stop down through the keyboard drag sensor", async () => {
    const stops = makeStops();
    const onReorder = vi.fn();
    const user = userEvent.setup();

    render(
      <SortableStopList
        stops={stops}
        onReorder={onReorder}
        onRemove={vi.fn()}
        onEditWindow={vi.fn()}
      />,
    );

    const secondHandle = screen.getAllByRole("button", { name: "Reordenar ponto" })[1];
    if (secondHandle === undefined) {
      throw new Error("expected three drag handles to render");
    }
    await keyboardReorder(user, secondHandle, "{ArrowDown}");

    expect(onReorder).toHaveBeenCalledWith([stops[0], stops[2], stops[1]]);
  });

  it("reports a from-time edit through onEditWindow with the stop key and field", () => {
    const stops = makeStops();
    const onEditWindow = vi.fn();

    render(
      <SortableStopList
        stops={stops}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onEditWindow={onEditWindow}
      />,
    );

    const fromInputs = screen.getAllByLabelText("Chegada prevista (início)");
    fireEvent.change(fromInputs[0] as HTMLInputElement, { target: { value: "08:30" } });

    expect(onEditWindow).toHaveBeenCalledWith("k1", "from", "08:30");
  });

  it("removes a stop through onRemove with its key", async () => {
    const stops = makeStops();
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(
      <SortableStopList
        stops={stops}
        onReorder={vi.fn()}
        onRemove={onRemove}
        onEditWindow={vi.fn()}
      />,
    );

    const removeButtons = screen.getAllByRole("button", { name: "Remover ponto" });
    await user.click(removeButtons[1] as HTMLButtonElement);

    expect(onRemove).toHaveBeenCalledWith("k2");
  });

  it("renders the empty-state message when there are no stops", () => {
    render(
      <SortableStopList stops={[]} onReorder={vi.fn()} onRemove={vi.fn()} onEditWindow={vi.fn()} />,
    );

    expect(screen.getByText("Nenhum ponto adicionado.")).toBeInTheDocument();
  });
});
