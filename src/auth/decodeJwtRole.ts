import type { Session } from "@/auth/AuthContext";

/** Reads the `role` claim off the access token's payload without verifying the signature —
 * the JWT is public, only the signature is secret. The dashboard only uses this to decide
 * what to render; the backend's require_role() is the actual authority on every request. */
export function decodeJwtRole(accessToken: string): Session["role"] {
  const [, payloadB64] = accessToken.split(".");
  if (payloadB64 === undefined) {
    throw new Error(
      `decodeJwtRole received a token with no payload segment "${accessToken}"; expected a three-part JWT (header.payload.signature).`,
    );
  }
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as {
    role: Session["role"];
  };

  return payload.role;
}
