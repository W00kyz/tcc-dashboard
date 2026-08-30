import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { BuildingsPage } from "@/routes/BuildingsPage";
import { ContractorCompaniesPage } from "@/routes/ContractorCompaniesPage";
import { EventsPage } from "@/routes/EventsPage";
import { FieldWorkersPage } from "@/routes/FieldWorkersPage";
import { FloorsPage } from "@/routes/FloorsPage";
import { LoginPage } from "@/routes/LoginPage";
import { RouteBoardPage } from "@/routes/RouteBoardPage";
import { ServiceTypesPage } from "@/routes/ServiceTypesPage";
import { UsersPage } from "@/routes/UsersPage";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/entrar" replace /> },
  { path: "/entrar", element: <LoginPage /> },
  {
    element: <ProtectedRoute allowedRoles={["MANAGER", "ADMIN"]} />,
    children: [
      { path: "/rotas", element: <RouteBoardPage /> },
      { path: "/tipos-de-servico", element: <ServiceTypesPage /> },
      { path: "/empresas-terceirizadas", element: <ContractorCompaniesPage /> },
      { path: "/profissionais", element: <FieldWorkersPage /> },
      { path: "/predios", element: <BuildingsPage /> },
      { path: "/predios/:buildingId/andares", element: <FloorsPage /> },
      { path: "/eventos", element: <EventsPage /> },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["ADMIN"]} />,
    children: [{ path: "/usuarios", element: <UsersPage /> }],
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
