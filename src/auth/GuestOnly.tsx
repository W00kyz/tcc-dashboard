import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { homePathFor } from "@/auth/homePath";

/** Public-only pages (login, and `/` itself): a signed-in user is sent to their home instead
 * of seeing the login card inside the app shell. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (session !== null) {
    return <Navigate to={homePathFor(session.role)} replace />;
  }

  return <>{children}</>;
}
