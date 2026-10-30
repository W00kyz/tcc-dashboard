import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { NewRoomDialog, suggestRoomName } from "@/components/buildings/NewRoomDialog";
import { AddServiceDialog, RenameRoomDialog } from "@/components/buildings/RoomDialogs";
import { FakeApi } from "@/test/fakeApi";

const FLOOR = { id: "f1", building_id: "b1", label: "Térreo", level: 0 };
const ROOM = { id: "r1", floor_id: "f1", name: "101" };
const TYPES = [
  {
    id: "t1",
    name: "Limpeza",
    average_duration_minutes: 30,
    requires_evidence: true,
    contractor_company_id: "c1",
    contractor_company_name: "Alfa",
  },
  {
    id: "t2",
    name: "Elétrica",
    average_duration_minutes: 30,
    requires_evidence: true,
    contractor_company_id: "c2",
    contractor_company_name: "Beta",
  },
  {
    id: "t3",
    name: "Jardinagem",
    average_duration_minutes: 30,
    requires_evidence: true,
    contractor_company_id: "c1",
    contractor_company_name: "Alfa",
  },
  {
    id: "t4",
    name: "Sem empresa",
    average_duration_minutes: 30,
    requires_evidence: true,
    contractor_company_id: null,
    contractor_company_name: null,
  },
];
const CREATED = { id: "r2", floor_id: "f1", name: "102", cleaning: "CREATED" };

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>,
  );
}

describe("suggestRoomName", () => {
  const named = (name: string, floorId = "f1") => ({ id: name, floor_id: floorId, name });

  it("starts at the floor's hundred and follows the highest number used", () => {
    expect(suggestRoomName(FLOOR, [])).toBe("101");
    expect(suggestRoomName(FLOOR, [named("101"), named("103")])).toBe("104");
    expect(suggestRoomName({ ...FLOOR, level: 1 }, [named("201")])).toBe("202");
  });

  it("ignores names that are not plain numbers of the floor's range", () => {
    const rooms = [named("Auditório Hattori"), named("205"), named("1A1"), named("101")];

    expect(suggestRoomName(FLOOR, rooms)).toBe("102");
  });
});

describe("NewRoomDialog", () => {
  function openDialog(onCreated = vi.fn()) {
    renderWithClient(<NewRoomDialog floor={FLOOR} rooms={[ROOM]} onCreated={onCreated} />);

    return userEvent.click(screen.getByRole("button", { name: "Nova sala" }));
  }

  it("suggests the next number as a placeholder and posts no name when left blank", async () => {
    const api = new FakeApi().on("POST", "/rooms", CREATED, 201).install();
    const onCreated = vi.fn();

    await openDialog(onCreated);
    const dialog = await screen.findByRole("dialog", { name: "Nova sala" });
    expect(within(dialog).getByLabelText("Nome da sala (opcional)")).toHaveAttribute(
      "placeholder",
      "102",
    );
    expect(within(dialog).getByRole("checkbox", { name: "Limpeza" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/rooms")[0]?.body).toEqual({ floor_id: "f1", with_cleaning: true });
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith("CREATED");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("posts the typed name", async () => {
    const api = new FakeApi().on("POST", "/rooms", CREATED, 201).install();

    await openDialog();
    await userEvent.type(screen.getByLabelText("Nome da sala (opcional)"), " Auditório Hattori ");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/rooms")[0]?.body).toEqual({
        floor_id: "f1",
        name: "Auditório Hattori",
        with_cleaning: true,
      });
    });
  });

  it("creates the room without the cleaning point when Limpeza is unchecked", async () => {
    const api = new FakeApi()
      .on("POST", "/rooms", { ...CREATED, cleaning: "SKIPPED" }, 201)
      .install();

    await openDialog();
    await userEvent.click(screen.getByRole("checkbox", { name: "Limpeza" }));
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/rooms")[0]?.body).toEqual({ floor_id: "f1", with_cleaning: false });
    });
  });

  it("reports when the room was created without its cleaning point", async () => {
    new FakeApi().on("POST", "/rooms", { ...CREATED, cleaning: "NO_CLEANING_TYPE" }, 201).install();
    const onCreated = vi.fn();

    await openDialog(onCreated);
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith("NO_CLEANING_TYPE");
    });
  });

  it("keeps the dialog open and says so when the name is already taken", async () => {
    new FakeApi().on("POST", "/rooms", { detail: "duplicate" }, 409).install();
    const onCreated = vi.fn();

    await openDialog(onCreated);
    await userEvent.type(screen.getByLabelText("Nome da sala (opcional)"), "101");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    const dialog = screen.getByRole("dialog", { name: "Nova sala" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Não foi possível cadastrar a sala",
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("AddServiceDialog", () => {
  function openDialog(usedTypeIds: string[]) {
    renderWithClient(
      <AddServiceDialog room={ROOM} serviceTypes={TYPES} usedTypeIds={usedTypeIds} />,
    );

    return userEvent.click(screen.getByRole("button", { name: "Adicionar serviço" }));
  }

  it("offers the types grouped by company, without used ones nor types without a company", async () => {
    new FakeApi().install();

    await openDialog(["t3"]);
    const select = await screen.findByLabelText("Tipo de serviço");

    const groups = within(select).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("label"))).toEqual(["Alfa", "Beta"]);
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["", "Limpeza", "Elétrica"]);
  });

  it("posts the chosen type to the room", async () => {
    const api = new FakeApi().on("POST", "/rooms/r1/services", { id: "p9" }, 201).install();

    await openDialog([]);
    await userEvent.selectOptions(await screen.findByLabelText("Tipo de serviço"), "t2");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/rooms/r1/services")[0]?.body).toEqual({ service_type_id: "t2" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("says the room already has the service when the API reports it", async () => {
    new FakeApi()
      .on("POST", "/rooms/r1/services", { detail: { code: "ROOM_SERVICE_EXISTS" } }, 409)
      .install();

    await openDialog([]);
    await userEvent.selectOptions(await screen.findByLabelText("Tipo de serviço"), "t1");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esta sala já tem esse serviço.");
  });
});

describe("RenameRoomDialog", () => {
  it("renames the room", async () => {
    const api = new FakeApi().on("PATCH", "/rooms/r1", { ...ROOM, name: "Sala 1" }).install();

    renderWithClient(<RenameRoomDialog room={ROOM} />);
    await userEvent.click(screen.getByRole("button", { name: "Renomear" }));
    const input = await screen.findByLabelText("Nome da sala");
    expect(input).toHaveValue("101");
    await userEvent.clear(input);
    await userEvent.type(input, "Sala 1");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/rooms/r1")[0]?.body).toEqual({ name: "Sala 1" });
    });
  });

  it("says so and keeps the dialog open when the name is already taken", async () => {
    new FakeApi().on("PATCH", "/rooms/r1", { detail: "duplicate" }, 409).install();

    renderWithClient(<RenameRoomDialog room={ROOM} />);
    await userEvent.click(screen.getByRole("button", { name: "Renomear" }));
    const input = await screen.findByLabelText("Nome da sala");
    await userEvent.clear(input);
    await userEvent.type(input, "102");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar a sala");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
