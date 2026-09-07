import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
  RouterProvider,
} from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppNav } from "@/components/AppNav";
import { AlertRulesPage } from "@/routes/AlertRulesPage";
import { BuildingsPage } from "@/routes/BuildingsPage";
import { ContractorCompaniesPage } from "@/routes/ContractorCompaniesPage";
import { EventsPage } from "@/routes/EventsPage";
import { ExecutionHistoryPage } from "@/routes/ExecutionHistoryPage";
import { FieldWorkersPage } from "@/routes/FieldWorkersPage";
import { FloorsPage } from "@/routes/FloorsPage";
import { FormBuilderPage } from "@/routes/FormBuilderPage";
import { LoginPage } from "@/routes/LoginPage";
import { NotificationsPage } from "@/routes/NotificationsPage";
import { ReassignmentsPage } from "@/routes/ReassignmentsPage";
import { RouteBoardPage } from "@/routes/RouteBoardPage";
import { RouteBuilderPage } from "@/routes/RouteBuilderPage";
import { RouteTemplatesPage } from "@/routes/RouteTemplatesPage";
import { ServicePointsPage } from "@/routes/ServicePointsPage";
import { ServiceTypesPage } from "@/routes/ServiceTypesPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { UsersPage } from "@/routes/UsersPage";

const queryClient = new QueryClient();

// Exported so tests can assert which ProtectedRoute branch a page sits under without
// standing up the whole browser router.
export const appRoutes: RouteObject[] = [
  { path: "/", element: <Navigate to="/entrar" replace /> },
  { path: "/entrar", element: <LoginPage /> },
  {
    element: <ProtectedRoute allowedRoles={["MANAGER", "ADMIN"]} />,
    children: [
      { path: "/rotas", element: <RouteBoardPage /> },
      { path: "/regras-de-alerta", element: <AlertRulesPage /> },
      { path: "/reatribuicoes", element: <ReassignmentsPage /> },
      { path: "/notificacoes", element: <NotificationsPage /> },
      { path: "/execucoes", element: <ExecutionHistoryPage /> },
      { path: "/rotas/nova", element: <RouteBuilderPage /> },
      { path: "/rotas/:routeId/editar", element: <RouteBuilderPage /> },
      { path: "/templates-de-rota", element: <RouteTemplatesPage /> },
      { path: "/tipos-de-servico", element: <ServiceTypesPage /> },
      { path: "/empresas-terceirizadas", element: <ContractorCompaniesPage /> },
      { path: "/profissionais", element: <FieldWorkersPage /> },
      { path: "/predios", element: <BuildingsPage /> },
      { path: "/predios/:buildingId/andares", element: <FloorsPage /> },
      { path: "/eventos", element: <EventsPage /> },
      { path: "/pontos-de-servico", element: <ServicePointsPage /> },
    ],
  },
  {
    element: <ProtectedRoute allowedRoles={["ADMIN"]} />,
    children: [
      { path: "/usuarios", element: <UsersPage /> },
      { path: "/formularios", element: <FormBuilderPage /> },
      { path: "/configuracoes", element: <SettingsPage /> },
    ],
  },
];

// Pathless layout route: the only nav shell this dashboard has (spec §7.1). AppNav renders
// nothing without a session, so /entrar keeps its bare full-screen layout. Kept out of the
// exported `appRoutes` so that array still maps ProtectedRoute branches to page paths 1:1.
const router = createBrowserRouter([
  {
    element: (
      <>
        <AppNav />
        <Outlet />
      </>
    ),
    children: appRoutes,
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
