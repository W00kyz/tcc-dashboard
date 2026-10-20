import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  assertSaved,
  RegistryFormFooter,
  RegistrySaveError,
  useRegistryForm,
} from "@/components/layout/registryForm";

describe("useRegistryForm", () => {
  it("flags blank and whitespace-only required fields only after a submit attempt", () => {
    const { result } = renderHook(() =>
      useRegistryForm({ name: "  ", cnpj: "1" }, ["name", "cnpj"]),
    );
    expect(result.current.isInvalid("name")).toBe(false);

    let allowed = true;
    act(() => {
      allowed = result.current.validate();
    });

    expect(allowed).toBe(false);
    expect(result.current.isInvalid("name")).toBe(true);
    expect(result.current.isInvalid("cnpj")).toBe(false);
  });

  it("loads a record for editing and clears back to a blank create form", () => {
    const { result } = renderHook(() => useRegistryForm({ name: "" }, ["name"]));

    act(() => {
      result.current.startEdit("b1", { name: "Bloco CI" });
    });
    expect(result.current.editingId).toBe("b1");
    expect(result.current.values.name).toBe("Bloco CI");

    act(() => {
      result.current.reset();
    });
    expect(result.current.editingId).toBeNull();
    expect(result.current.values.name).toBe("");
  });
});

describe("assertSaved", () => {
  it("throws with the status for a non-2xx response", () => {
    expect(() => {
      assertSaved(new Response(null, { status: 409 }), "POST /buildings");
    }).toThrow(RegistrySaveError);
  });

  it("accepts a 2xx response", () => {
    expect(() => {
      assertSaved(new Response(null, { status: 201 }), "POST /buildings");
    }).not.toThrow();
  });
});

describe("RegistryFormFooter", () => {
  function Footer({ error }: { error: Error | null }) {
    const form = useRegistryForm({ name: "x" }, ["name"]);

    return (
      <RegistryFormFooter
        form={form}
        save={{ isPending: false, error, reset: () => undefined }}
        fieldLabels={{ name: "Nome" }}
        createLabel="Cadastrar"
      />
    );
  }

  it("explains a duplicate (409) differently from any other failure", () => {
    const { rerender } = render(<Footer error={new RegistrySaveError(409, "POST /x")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe um cadastro");

    rerender(<Footer error={new RegistrySaveError(500, "POST /x")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar");
  });
});
