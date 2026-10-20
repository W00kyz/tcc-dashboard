import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ContractorCompaniesPage } from "@/routes/ContractorCompaniesPage";
import { FakeApi } from "@/test/fakeApi";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ContractorCompaniesPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ContractorCompaniesPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists existing contractor companies with their service types", async () => {
    new FakeApi()
      .on("GET", "/contractor-companies", [
        {
          id: "c1",
          name: "Limpa Tudo Terceirizados Ltda",
          cnpj: "12345678000199",
          service_types: [
            { id: "t1", name: "Limpeza", average_duration_minutes: 30 },
            { id: "t2", name: "Jardinagem", average_duration_minutes: 45 },
          ],
        },
      ])
      .install();

    renderPage();

    expect(await screen.findByText("Limpa Tudo Terceirizados Ltda")).toBeInTheDocument();
    expect(screen.getByText("Limpeza, Jardinagem")).toBeInTheDocument();
  });

  it("submits the create-contractor-company form", async () => {
    const api = new FakeApi()
      .on("GET", "/contractor-companies", [])
      .on("GET", "/service-types", [])
      .on(
        "POST",
        "/contractor-companies",
        { id: "c2", name: "Verde Jardins Ltda", cnpj: "98765432000188", service_types: [] },
        201,
      )
      .install();

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Verde Jardins Ltda");
    await userEvent.type(screen.getByLabelText("CNPJ"), "98765432000188");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/contractor-companies")[0]?.body).toEqual({
        name: "Verde Jardins Ltda",
        cnpj: "98765432000188",
        service_types: [],
      });
    });
  });
});

const COMPANY = {
  id: "c1",
  name: "Limpa Tudo",
  cnpj: "12345678000199",
  service_types: [{ id: "t1", name: "Limpeza", average_duration_minutes: 30 }],
};

function companiesApi() {
  return new FakeApi()
    .on("GET", "/contractor-companies", [COMPANY])
    .on("GET", "/service-types", [])
    .install();
}

async function openCompanyDialog() {
  await userEvent.click(await screen.findByRole("button", { name: "Editar Limpa Tudo" }));

  return screen.getByRole("dialog");
}

describe("ContractorCompaniesPage service types", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds a type and saves", async () => {
    const api = companiesApi().on("PATCH", "/contractor-companies/c1", COMPANY);

    renderPage();
    const dialog = await openCompanyDialog();
    expect(within(dialog).getByLabelText("Nome do tipo 1")).toHaveValue("Limpeza");
    await userEvent.click(within(dialog).getByRole("button", { name: "Adicionar tipo" }));
    await userEvent.type(within(dialog).getByLabelText("Nome do tipo 2"), "Dedetização");
    await userEvent.clear(within(dialog).getByLabelText("Duração média do tipo 2 (min)"));
    await userEvent.type(within(dialog).getByLabelText("Duração média do tipo 2 (min)"), "90");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/contractor-companies/c1")[0]?.body).toEqual({
        name: "Limpa Tudo",
        cnpj: "12345678000199",
        service_types: [
          { id: "t1", name: "Limpeza", average_duration_minutes: 30 },
          { id: null, name: "Dedetização", average_duration_minutes: 90 },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("blocks a type without a name", async () => {
    const api = companiesApi();

    renderPage();
    const dialog = await openCompanyDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Adicionar tipo" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));

    expect(
      await within(dialog).findByText(
        "Todo tipo de serviço precisa de nome e de duração média maior que zero.",
      ),
    ).toBeInTheDocument();
    expect(api.sent("PATCH", "/contractor-companies/c1")).toHaveLength(0);
  });

  it("removing a type in use keeps dialog open with count", async () => {
    const api = companiesApi().onRequest(
      "PATCH",
      "/contractor-companies/c1",
      () => ({
        detail: {
          code: "SERVICE_TYPE_IN_USE",
          detail: "in use",
          service_type_id: "t1",
          points: 3,
        },
      }),
      409,
    );

    renderPage();
    const dialog = await openCompanyDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover tipo Limpeza" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));

    expect(
      await within(dialog).findByText(
        "O tipo “Limpeza” é usado por 3 pontos e não pode ser removido.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      (api.sent("PATCH", "/contractor-companies/c1")[0]?.body as { service_types: unknown[] })
        .service_types,
    ).toEqual([]);
  });

  it("explains a type that has history", async () => {
    companiesApi().onRequest(
      "PATCH",
      "/contractor-companies/c1",
      () => ({
        detail: { code: "SERVICE_TYPE_HAS_HISTORY", detail: "history", service_type_id: "t1" },
      }),
      409,
    );

    renderPage();
    const dialog = await openCompanyDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover tipo Limpeza" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));

    expect(
      await within(dialog).findByText(
        "O tipo “Limpeza” já tem histórico de atendimentos e não pode ser removido.",
      ),
    ).toBeInTheDocument();
  });

  it("attaches an orphan type", async () => {
    const api = companiesApi()
      .on("GET", "/service-types", [
        {
          id: "t9",
          name: "Pintura",
          average_duration_minutes: 60,
          contractor_company_id: null,
          contractor_company_name: null,
        },
      ])
      .on("PATCH", "/contractor-companies/c1", COMPANY);

    renderPage();
    const dialog = await openCompanyDialog();
    await userEvent.selectOptions(
      await within(dialog).findByLabelText("Adicionar tipo sem empresa"),
      "t9",
    );
    expect(within(dialog).getByLabelText("Nome do tipo 2")).toHaveValue("Pintura");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(
        (api.sent("PATCH", "/contractor-companies/c1")[0]?.body as { service_types: unknown[] })
          .service_types,
      ).toContainEqual({ id: "t9", name: "Pintura", average_duration_minutes: 60 });
    });
    expect(api.sent("GET", "/service-types")[0]?.query.get("unassigned")).toBe("true");
  });

  it("hides the orphan picker when every type has a company", async () => {
    companiesApi();

    renderPage();
    const dialog = await openCompanyDialog();
    await within(dialog).findByLabelText("Nome do tipo 1");

    expect(within(dialog).queryByLabelText("Adicionar tipo sem empresa")).toBeNull();
  });
});
