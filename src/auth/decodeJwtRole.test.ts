import { decodeJwtRole, decodeJwtSubject } from "@/auth/decodeJwtRole";

function fakeAccessToken(claims: Record<string, string>): string {
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_");

  return `header.${payload}.signature`;
}

describe("access token claims", () => {
  const token = fakeAccessToken({ sub: "user-42", role: "ADMIN" });

  it("reads the role", () => {
    expect(decodeJwtRole(token)).toBe("ADMIN");
  });

  it("reads the user id from the sub claim", () => {
    expect(decodeJwtSubject(token)).toBe("user-42");
  });

  it("rejects a token without a payload segment", () => {
    expect(() => decodeJwtSubject("not-a-jwt")).toThrow(/three-part JWT/);
  });
});
