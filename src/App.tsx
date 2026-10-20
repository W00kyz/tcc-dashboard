import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, type RouteObject, RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { ConsentGate } from "@/auth/ConsentGate";
import { GuestOnly } from "@/auth/GuestOnly";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppShell } from "@/components/shell/AppShell";
import { AlertRulesPage } from "@/routes/AlertRulesPage";
import { BuildingsPage } from "@/routes/BuildingsPage";
import { LegacyBuildingRedirect } from "@/routes/legacyRedirects";
import { ContractorCompaniesPage } from "@/routes/ContractorCompaniesPage";
import { ExecutionHistoryPage } from "@/routes/ExecutionHistoryPage";
import { FieldWorkersPage } from "@/routes/FieldWorkersPage";
import { ForgotPasswordPage } from "@/routes/ForgotPasswordPage";
import { FormBuilderPage } from "@/routes/FormBuilderPage";
import { LoginPage } from "@/routes/LoginPage";
import { MyDataPage } from "@/routes/MyDataPage";
import { NotFoundPage } from "@/routes/NotFoundPage";
import { NotificationsPage } from "@/routes/NotificationsPage";
import { ReportsPage } from "@/routes/ReportsPage";
import { ResetPasswordPage } from "@/routes/ResetPasswordPage";
import { RouteBoardPage } from "@/routes/RouteBoardPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { UsersPage } from "@/routes/UsersPage";

const queryClient = new QueryClient();

// Exported so tests can assert which ProtectedRoute branch a page sits under without
// standing up the whole browser router.
export const appRoutes: RouteObject[] = [
  // Signed in, both land on the user's home; signed out, "/" falls through to the login.
  {
    path: "/",
    element: (
      <GuestOnly>
        <Navigate to="/entrar" replace />
      </GuestOnly>
    ),
  },
  {
    path: "/entrar",
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  // Public: reached from the e-mailed links (RF03 recovery, RF05 invite).
  { path: "/esqueci-senha", element: <ForgotPasswordPage /> },
  { path: "/redefinir-senha", element: <ResetPasswordPage /> },
  {
    element: (
      <ConsentGate>
        <ProtectedRoute allowedRoles={["MANAGER", "ADMIN"]} />
      </ConsentGate>
    ),
    children: [
      { path: "/rotas", element: <RouteBoardPage /> },
      { path: "/regras-de-alerta", element: <AlertRulesPage /> },
      { path: "/notificacoes", element: <NotificationsPage /> },
      { path: "/execucoes", element: <ExecutionHistoryPage /> },
      { path: "/relatorios", element: <ReportsPage /> },
      // Routes are allocated automatically now (spec 2026-10-20-alocacao-automatica §8.1):
      // nothing is planned, reassigned or built by hand, so the old pages land on the board.
      { path: "/templates-de-rota", element: <Navigate to="/rotas" replace /> },
      { path: "/reatribuicoes", element: <Navigate to="/rotas" replace /> },
      { path: "/rotas/nova", element: <Navigate to="/rotas" replace /> },
      { path: "/rotas/:routeId/editar", element: <Navigate to="/rotas" replace /> },
      // Service types belong to a company and are edited in its dialog.
      { path: "/tipos-de-servico", element: <Navigate to="/empresas-terceirizadas" replace /> },
      { path: "/empresas-terceirizadas", element: <ContractorCompaniesPage /> },
      { path: "/profissionais", element: <FieldWorkersPage /> },
      { path: "/predios", element: <BuildingsPage /> },
      // Everything about a building opens from the map now; old links land there, selected.
      { path: "/predios/:buildingId", element: <LegacyBuildingRedirect /> },
      { path: "/predios/:buildingId/andares", element: <LegacyBuildingRedirect /> },
      { path: "/pontos-de-servico", element: <Navigate to="/predios" replace /> },
      // RF36: managers maintain the execution forms (the API already allows MANAGER).
      { path: "/formularios", element: <FormBuilderPage /> },
    ],
  },
  {
    // "Meus dados" (RNF10): any authenticated user may see their own personal-data export.
    element: (
      <ConsentGate>
        <ProtectedRoute allowedRoles={["FIELD_WORKER", "MANAGER", "ADMIN"]} />
      </ConsentGate>
    ),
    children: [{ path: "/meus-dados", element: <MyDataPage /> }],
  },
  {
    element: (
      <ConsentGate>
        <ProtectedRoute allowedRoles={["ADMIN"]} />
      </ConsentGate>
    ),
    children: [
      { path: "/usuarios", element: <UsersPage /> },
      { path: "/configuracoes", element: <SettingsPage /> },
    ],
  },
  // Without a catch-all React Router shows its developer error screen for unknown URLs.
  { path: "*", element: <NotFoundPage /> },
];

// Pathless layout route: the only nav shell this dashboard has (spec §7.1). AppShell renders
// the bare page without a session, so /entrar keeps its full-screen layout. Kept out of the
// exported `appRoutes` so that array still maps ProtectedRoute branches to page paths 1:1.
const router = createBrowserRouter([{ element: <AppShell />, children: appRoutes }]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
