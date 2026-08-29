import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { LoginPage } from "@/routes/LoginPage";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/entrar" replace /> },
  { path: "/entrar", element: <LoginPage /> },
  {
    element: <ProtectedRoute allowedRoles={["MANAGER", "ADMIN"]} />,
    children: [
      // RouteBoardPage arrives at "/rotas" in Task 13.
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
