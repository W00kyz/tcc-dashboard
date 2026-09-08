import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

export interface Session {
  accessToken: string;
  refreshToken: string;
  role: "FIELD_WORKER" | "MANAGER" | "ADMIN";
  // Set from the login response's `consent_required`. Drives <ConsentGate>. The gate
  // re-checks against the API on mount, so a stale value only affects the first paint.
  consentRequired: boolean;
}

interface AuthContextValue {
  session: Session | null;
  setSession: (session: Session) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "route-monitor.session";

function readStoredSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  // Sessions stored before Etapa 11 have no `consentRequired`; a returning user with a
  // valid token consented under the older flow, so treat the missing field as `false`.
  const parsed = JSON.parse(raw) as Omit<Session, "consentRequired"> & {
    consentRequired?: boolean;
  };

  return { ...parsed, consentRequired: parsed.consentRequired ?? false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(readStoredSession);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      setSession: (next) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSessionState(next);
      },
      clearSession: () => {
        localStorage.removeItem(STORAGE_KEY);
        setSessionState(null);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
