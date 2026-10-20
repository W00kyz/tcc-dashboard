import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { JustificationsPage } from "@/routes/JustificationsPage";
import { FakeApi } from "@/test/fakeApi";

function impediment(overrides: Record<string, unknown>) {
  return {
    id: "i1",
    route_id: "r1",
    route_stop_id: "s1",
    scope: "STOP",
    reason: "ACCESS_BLOCKED",
    note: "Porta trancada",
    status: "PENDING",
    reported_at: "2026-10-20T13:00:00Z",
    received_at: "2026-10-20T13:00:05Z",
    field_worker_id: "w1",
    field_worker_name: "João da Silva",
    service_point_name: "Sala 101",
    building_name: "Bloco A",
    resolved_at: null,
    ...overrides,
  };
}

function appeal(overrides: Record<string, unknown>) {
  return {
    id: "a1",
    route_stop_id: "s1",
    field_worker_id: "w1",
    field_worker_name: "Maria Souza",
    service_point_id: "p1",
    service_point_name: "Sala 202",
    building_name: "Bloco B",
    released_at: "2026-10-20T12:00:00Z",
    release_reason: "LEFT_CAMPUS",
    reason: "NO_SIGNAL",
    note: "Estava no subsolo",
    claimed_executed_at: "2026-10-20T11:40:00Z",
    status: "PENDING",
    filed_at: "2026-10-20T13:00:00Z",
    reviewed_at: null,
    reviewed_by_name: null,
    review_note: null,
    ...overrides,
  };
}

const SETTINGS = { appeal_window_hours: 48 };
const DECIDED = appeal({
  id: "a0",
  field_worker_name: "Ana Lima",
  status: "ACCEPTED",
  reviewed_by_name: "Carlos Gestor",
  reviewed_at: "2026-10-20T14:00:00Z",
});
const PENDING = appeal({});

function renderPage(api: FakeApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.install();

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <JustificationsPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function apiWith(appeals: unknown[] = [], impediments: unknown[] = []) {
  return new FakeApi()
    .on("GET", "/appeals", appeals)
    .on("GET", "/impediments", impediments)
    .on("GET", "/settings", SETTINGS);
}

async function openAppealsTab() {
  await userEvent.click(await screen.findByRole("tab", { name: /Recursos/ }));
}

function rowWith(text: string): HTMLElement {
  const row = screen
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByText(text) !== null);
  if (row === undefined) {
    throw new Error(`No row shows "${text}".`);
  }

  return row;
}

describe("JustificationsPage", () => {
  it("lists pending appeals first", async () => {
    renderPage(apiWith([DECIDED, PENDING]));

    await openAppealsTab();
    await screen.findByText("Maria Souza");

    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent);
    expect(names[0]).toContain("Maria Souza");
    expect(names[1]).toContain("Ana Lima");
    expect(within(rowWith("Ana Lima")).getByText("Aceito por Carlos Gestor")).toBeInTheDocument();
    expect(within(rowWith("Ana Lima")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the appeal with the deadline from the appeal window", async () => {
    renderPage(apiWith([PENDING]));

    await openAppealsTab();
    await screen.findByText("Maria Souza");
    const row = rowWith("Estava no subsolo");

    expect(within(row).getByText("Saiu do campus")).toBeInTheDocument();
    expect(within(row).getByText("Fiquei sem sinal")).toBeInTheDocument();
    expect(within(row).getByText("Estava no subsolo")).toBeInTheDocument();
    // released 20/10 12:00Z + 48 h = 22/10 12:00Z
    expect(
      within(row).getByText(
        new Date("2026-10-22T12:00:00Z").toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }),
      ),
    ).toBeInTheDocument();
  });

  it("accept posts note and refreshes", async () => {
    const api = apiWith([PENDING]).on("POST", "/appeals/a1/accept", {
      ...PENDING,
      status: "ACCEPTED",
    });
    renderPage(api);
    const user = userEvent.setup();

    await openAppealsTab();
    await user.click(
      await screen.findByRole("button", { name: "Aceitar o recurso de Maria Souza" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Aceitar recurso" });
    await user.type(within(dialog).getByLabelText("Observação"), "Confirmado com o prédio");
    await user.click(within(dialog).getByRole("button", { name: "Aceitar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/appeals/a1/accept")).toHaveLength(1);
    });
    expect(api.sent("POST", "/appeals/a1/accept")[0]?.body).toEqual({
      note: "Confirmado com o prédio",
    });
    await waitFor(() => {
      expect(api.sent("GET", "/appeals").length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("rejects with a blank note as null", async () => {
    const api = apiWith([PENDING]).on("POST", "/appeals/a1/reject", PENDING);
    renderPage(api);
    const user = userEvent.setup();

    await openAppealsTab();
    await user.click(
      await screen.findByRole("button", { name: "Recusar o recurso de Maria Souza" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Recusar recurso" });
    await user.click(within(dialog).getByRole("button", { name: "Recusar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/appeals/a1/reject")[0]?.body).toEqual({ note: null });
    });
  });

  it("explains a conflict when another manager decided first and refreshes", async () => {
    const api = apiWith([PENDING]).on(
      "POST",
      "/appeals/a1/accept",
      { detail: { code: "ALREADY_REVIEWED", detail: "decided" } },
      409,
    );
    renderPage(api);
    const user = userEvent.setup();

    await openAppealsTab();
    await user.click(
      await screen.findByRole("button", { name: "Aceitar o recurso de Maria Souza" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Aceitar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Outro gestor já decidiu este recurso.",
    );
    await waitFor(() => {
      expect(api.sent("GET", "/appeals").length).toBeGreaterThan(1);
    });
  });

  it("acknowledge impediment", async () => {
    const api = apiWith(
      [],
      [
        impediment({}),
        impediment({
          id: "i2",
          status: "RESOLVED",
          field_worker_name: "Pedro Alves",
          note: "Já visto",
        }),
      ],
    ).on("POST", "/impediments/i1/acknowledge", impediment({ status: "RESOLVED" }));
    renderPage(api);
    const user = userEvent.setup();

    await screen.findByText("Porta trancada");
    const row = rowWith("Porta trancada");
    expect(within(row).getByText("João da Silva")).toBeInTheDocument();
    expect(within(row).getByText("Bloco A")).toBeInTheDocument();
    expect(within(row).getByText("Acesso bloqueado")).toBeInTheDocument();
    await user.click(
      within(row).getByRole("button", { name: "Ciente do impedimento de João da Silva" }),
    );

    await waitFor(() => {
      expect(api.sent("POST", "/impediments/i1/acknowledge")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(api.sent("GET", "/impediments").length).toBeGreaterThan(1);
    });
    // The already-acknowledged one offers no action.
    expect(screen.getAllByRole("button", { name: /^Ciente do impedimento/ })).toHaveLength(1);
  });

  it("names the route remainder when an impediment has no point", async () => {
    renderPage(
      apiWith(
        [],
        [impediment({ scope: "ROUTE_REMAINDER", service_point_name: null, building_name: null })],
      ),
    );

    expect(await screen.findByText("Resto da rota")).toBeInTheDocument();
  });

  it("switches tabs with the keyboard", async () => {
    renderPage(apiWith([PENDING], [impediment({})]));
    const user = userEvent.setup();

    const impedimentsTab = await screen.findByRole("tab", { name: /Impedimentos/ });
    impedimentsTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: /Recursos/ })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Maria Souza")).toBeInTheDocument();
  });
});
