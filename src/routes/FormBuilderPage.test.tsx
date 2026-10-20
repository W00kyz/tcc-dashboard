import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { FormBuilderPage } from "@/routes/FormBuilderPage";

const SESSION = { accessToken: "token", refreshToken: "refresh", role: "ADMIN" };

interface FakeQuestion {
  id: string;
  stable_key: string;
  order_index: number;
  prompt: string;
  question_type: string;
  required: boolean;
  options: string[];
  content_hash: string | null;
}

let draftQuestions: FakeQuestion[] = [];
let published: {
  form_version_id: string;
  version_number: number;
  published_at: string;
  question_count: number;
}[] = [];
let nextKey = 1;

function draft() {
  return {
    form_version_id: "d1",
    status: "DRAFT",
    // Matches the real backend (app/domain/forms/service.py): a DRAFT's version_number is
    // always 0 — it's a placeholder the publish transaction overwrites, never something a
    // client should read to predict the next version (see FormBuilderPage.tsx's
    // nextVersionNumber, computed from `published.length` instead).
    version_number: 0,
    questions: [...draftQuestions].sort((a, b) => a.order_index - b.order_index),
  };
}

function overview() {
  return { form_id: "f1", service_type_id: "s1", draft: draft(), published };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status });
}

function questionFromBody(body: Record<string, unknown>, fallback: FakeQuestion): FakeQuestion {
  return {
    ...fallback,
    prompt: typeof body.prompt === "string" ? body.prompt : fallback.prompt,
    question_type:
      typeof body.question_type === "string" ? body.question_type : fallback.question_type,
    required: Boolean(body.required),
    options: Array.isArray(body.options) ? (body.options as string[]) : fallback.options,
  };
}

function makeFakeFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const { url, method } = request;
    const readBody = (): Promise<Record<string, unknown>> =>
      request.clone().json() as Promise<Record<string, unknown>>;

    if (url.includes("/service-types/s1/form")) {
      return jsonResponse(overview(), 200);
    }

    if (url.includes("/service-types") && method === "GET") {
      return jsonResponse(
        [
          {
            id: "s1",
            name: "Limpeza",
            average_duration_minutes: 30,
            contractor_company_id: "c1",
            contractor_company_name: "Limpa Tudo",
          },
        ],
        200,
      );
    }

    if (url.includes("/forms/f1/draft/order") && method === "PUT") {
      const keys = (await readBody()).stable_keys as string[];
      draftQuestions = keys.map((key, index) => {
        const found = draftQuestions.find((question) => question.stable_key === key);
        if (found === undefined) {
          throw new Error(`reorder referenced unknown key ${key}`);
        }

        return { ...found, order_index: index };
      });

      return jsonResponse(draft(), 200);
    }

    if (url.includes("/forms/f1/draft/questions/")) {
      const key = url.split("/draft/questions/")[1] ?? "";
      if (method === "PATCH") {
        const body = await readBody();
        draftQuestions = draftQuestions.map((question) =>
          question.stable_key === key ? questionFromBody(body, question) : question,
        );

        return jsonResponse(draft(), 200);
      }
      if (method === "DELETE") {
        draftQuestions = draftQuestions.filter((question) => question.stable_key !== key);

        return jsonResponse(draft(), 200);
      }
    }

    if (url.includes("/forms/f1/draft/questions") && method === "POST") {
      const base: FakeQuestion = {
        id: `id${String(nextKey)}`,
        stable_key: `q${String(nextKey)}`,
        order_index: draftQuestions.length,
        prompt: "",
        question_type: "TEXT",
        required: false,
        options: [],
        content_hash: null,
      };
      draftQuestions = [...draftQuestions, questionFromBody(await readBody(), base)];
      nextKey += 1;

      return jsonResponse(draft(), 201);
    }

    if (url.includes("/forms/f1/publish") && method === "POST") {
      published = [
        ...published,
        {
          form_version_id: `p${String(published.length + 1)}`,
          version_number: published.length + 1,
          published_at: "2026-09-04T00:00:00Z",
          question_count: draftQuestions.length,
        },
      ];

      return jsonResponse(draft(), 201);
    }

    throw new Error(`unexpected request: ${method} ${url}`);
  });
}

function seedQuestion(overrides: Partial<FakeQuestion>): void {
  draftQuestions.push({
    id: `id${String(nextKey)}`,
    stable_key: `q${String(nextKey)}`,
    order_index: draftQuestions.length,
    prompt: "Pergunta",
    question_type: "TEXT",
    required: false,
    options: [],
    content_hash: null,
    ...overrides,
  });
  nextKey += 1;
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FormBuilderPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function pickServiceType(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Limpeza — Limpa Tudo" });
  await user.selectOptions(screen.getByLabelText("Tipo de serviço"), "s1");
}

function requestsMatching(
  fakeFetch: ReturnType<typeof makeFakeFetch>,
  predicate: (request: Request) => boolean,
): Request[] {
  return fakeFetch.mock.calls.map(([input]) => input as Request).filter(predicate);
}

describe("FormBuilderPage", () => {
  beforeEach(() => {
    draftQuestions = [];
    published = [];
    nextKey = 1;
    localStorage.setItem("route-monitor.session", JSON.stringify(SESSION));
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the draft after picking a service type", async () => {
    const user = userEvent.setup();
    renderPage(makeFakeFetch());
    await pickServiceType(user);

    expect(await screen.findByText("O rascunho ainda não tem perguntas.")).toBeInTheDocument();
  });

  it("adds a question through the dialog and shows it in the list", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);
    await pickServiceType(user);
    await screen.findByText("O rascunho ainda não tem perguntas.");

    await user.click(screen.getByRole("button", { name: "Adicionar pergunta" }));
    await user.type(screen.getByLabelText("Enunciado"), "Havia sujeira?");
    await user.click(screen.getByRole("button", { name: "Salvar pergunta" }));

    expect(await screen.findByText("Havia sujeira?")).toBeInTheDocument();
    const posts = requestsMatching(
      fakeFetch,
      (request) => request.method === "POST" && request.url.includes("/draft/questions"),
    );
    expect(posts).toHaveLength(1);
  });

  it("patches a question when it is edited", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    seedQuestion({ stable_key: "qA", prompt: "Antigo" });
    renderPage(fakeFetch);
    await pickServiceType(user);
    await screen.findByText("Antigo");

    await user.click(screen.getByRole("button", { name: "Editar pergunta" }));
    const promptInput = screen.getByLabelText("Enunciado");
    await user.clear(promptInput);
    await user.type(promptInput, "Novo enunciado");
    await user.click(screen.getByRole("button", { name: "Salvar pergunta" }));

    await waitFor(() => {
      const patches = requestsMatching(
        fakeFetch,
        (request) => request.method === "PATCH" && request.url.includes("/draft/questions/qA"),
      );
      expect(patches).toHaveLength(1);
    });
    expect(await screen.findByText("Novo enunciado")).toBeInTheDocument();
  });

  it("deletes a question after confirmation", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    seedQuestion({ stable_key: "qA", prompt: "Some fora" });
    renderPage(fakeFetch);
    await pickServiceType(user);
    await screen.findByText("Some fora");

    await user.click(screen.getByRole("button", { name: "Remover pergunta" }));

    await waitFor(() => {
      expect(screen.queryByText("Some fora")).not.toBeInTheDocument();
    });
    const deletes = requestsMatching(
      fakeFetch,
      (request) => request.method === "DELETE" && request.url.includes("/draft/questions/qA"),
    );
    expect(deletes).toHaveLength(1);
  });

  it("disables publish on an empty draft", async () => {
    const user = userEvent.setup();
    renderPage(makeFakeFetch());
    await pickServiceType(user);
    await screen.findByText("O rascunho ainda não tem perguntas.");

    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  });

  it("publishes after confirming and grows the published-versions list", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    seedQuestion({ stable_key: "qA", prompt: "Uma pergunta" });
    renderPage(fakeFetch);
    await pickServiceType(user);
    await screen.findByText("Uma pergunta");
    expect(screen.getByText("Nenhuma versão publicada ainda.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    await user.click(await screen.findByRole("button", { name: "Publicar versão" }));

    const versions = await screen.findByRole("region", { name: "Versões publicadas" });
    expect(await within(versions).findByText("v1")).toBeInTheDocument();
    const publishCalls = requestsMatching(
      fakeFetch,
      (request) => request.method === "POST" && request.url.includes("/forms/f1/publish"),
    );
    expect(publishCalls).toHaveLength(1);
  });

  // Regression for the bug the etapa-7 Task 7 review caught: the draft's own version_number
  // is always 0 on the real backend (a placeholder the publish transaction overwrites), so the
  // confirm text must be computed from `published.length + 1`, not read off the draft.
  it("shows the next version number computed from published.length, not the draft's placeholder", async () => {
    const user = userEvent.setup();
    seedQuestion({ stable_key: "qA", prompt: "Uma pergunta" });
    published = [
      {
        form_version_id: "p1",
        version_number: 1,
        published_at: "2026-09-01T00:00:00Z",
        question_count: 1,
      },
      {
        form_version_id: "p2",
        version_number: 2,
        published_at: "2026-09-02T00:00:00Z",
        question_count: 1,
      },
    ];
    renderPage(makeFakeFetch());
    await pickServiceType(user);
    await screen.findByText("Uma pergunta");

    await user.click(screen.getByRole("button", { name: "Publicar" }));

    expect(
      await screen.findByText(
        "Isto cria a versão 3 do formulário e não pode ser desfeito. Continuar?",
      ),
    ).toBeInTheDocument();
  });

  it("sends PUT /order with the reordered stable keys via the keyboard sensor", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    seedQuestion({ stable_key: "q1", prompt: "Primeira" });
    seedQuestion({ stable_key: "q2", prompt: "Segunda" });
    seedQuestion({ stable_key: "q3", prompt: "Terceira" });
    renderPage(fakeFetch);
    await pickServiceType(user);
    await screen.findByText("Primeira");

    const handles = screen.getAllByRole("button", { name: "Reordenar pergunta" });
    const secondHandle = handles[1];
    if (secondHandle === undefined) {
      throw new Error("expected three drag handles");
    }
    secondHandle.focus();
    await user.keyboard("{ }");
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{ }");

    await waitFor(() => {
      const orderCalls = requestsMatching(
        fakeFetch,
        (request) => request.method === "PUT" && request.url.includes("/draft/order"),
      );
      expect(orderCalls).toHaveLength(1);
    });
    const orderRequest = requestsMatching(
      fakeFetch,
      (request) => request.method === "PUT" && request.url.includes("/draft/order"),
    )[0];
    if (orderRequest === undefined) {
      throw new Error("expected a PUT /draft/order request");
    }
    expect(await orderRequest.clone().json()).toEqual({ stable_keys: ["q2", "q1", "q3"] });
  });
});
