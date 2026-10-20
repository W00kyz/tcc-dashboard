import type { Session } from "@/auth/AuthContext";

interface AccessTokenClaims {
  sub: string;
  role: Session["role"];
}

/** Reads the `role` claim off the access token's payload without verifying the signature —
 * the JWT is public, only the signature is secret. The dashboard only uses this to decide
 * what to render; the backend's require_role() is the actual authority on every request. */
function decodeAccessTokenClaims(accessToken: string): AccessTokenClaims {
  const [, payloadB64] = accessToken.split(".");
  if (payloadB64 === undefined) {
    throw new Error(
      `decodeAccessTokenClaims received a token with no payload segment "${accessToken}"; expected a three-part JWT (header.payload.signature).`,
    );
  }

  return JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as AccessTokenClaims;
}

export function decodeJwtRole(accessToken: string): Session["role"] {
  return decodeAccessTokenClaims(accessToken).role;
}

/** The signed-in user's id (`sub` claim) — lets a page recognise "this row is me".
 * @example decodeJwtSubject(session.accessToken) // "7f1c…" */
export function decodeJwtSubject(accessToken: string): string {
  return decodeAccessTokenClaims(accessToken).sub;
}
