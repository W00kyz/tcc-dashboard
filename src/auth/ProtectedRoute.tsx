import { Navigate, Outlet } from "react-router-dom";

import { type Session, useAuth } from "@/auth/AuthContext";

interface ProtectedRouteProps {
  allowedRoles?: Session["role"][];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { session } = useAuth();

  if (session === null) {
    return <Navigate to="/entrar" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return <Navigate to="/entrar" replace />;
  }

  return <Outlet />;
}
