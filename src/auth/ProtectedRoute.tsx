import { Navigate, Outlet } from "react-router-dom";

import { type Session, useAuth } from "@/auth/AuthContext";
import { homePathFor } from "@/auth/homePath";

interface ProtectedRouteProps {
  allowedRoles?: Session["role"][];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { session } = useAuth();

  if (session === null) {
    return <Navigate to="/entrar" replace />;
  }
  // Signed in but not allowed here: back to their own home. Sending them to /entrar would
  // render the login card inside the app shell, as if the session had been lost.
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return <Navigate to={homePathFor(session.role)} replace />;
  }

  return <Outlet />;
}
