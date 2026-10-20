import { homePathFor } from "@/auth/homePath";

describe("homePathFor", () => {
  it("sends a field worker to Meus dados", () => {
    expect(homePathFor("FIELD_WORKER")).toBe("/meus-dados");
  });

  it("sends managers and admins to the route board", () => {
    expect(homePathFor("MANAGER")).toBe("/rotas");
    expect(homePathFor("ADMIN")).toBe("/rotas");
  });
});
