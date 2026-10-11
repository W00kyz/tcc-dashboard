import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { registerAuthFetchHandlers } from "@/api/authFetch";
import { apiBaseUrl } from "@/api/client";

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

/** Trades the refresh token (7 days) for a new access token, or `null` when the server says
 * no (expired, revoked, user deactivated) or is unreachable. */
async function requestAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await globalThis.fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { access_token: string };

    return body.access_token;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(readStoredSession);
  // The fetch handlers outlive renders, so they read the session through a ref.
  const sessionRef = useRef(session);
  const inflightRefresh = useRef<Promise<string | null> | null>(null);

  const setSession = useCallback((next: Session) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    sessionRef.current = null;
    setSessionState(null);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    const refresh = async (): Promise<string | null> => {
      const current = sessionRef.current;
      if (current === null) {
        return null;
      }
      const accessToken = await requestAccessToken(current.refreshToken);
      if (accessToken === null) {
        // Refresh token gone too: back to the login screen (ProtectedRoute redirects).
        clearSession();

        return null;
      }
      setSession({ ...current, accessToken });

      return accessToken;
    };

    return registerAuthFetchHandlers({
      currentAccessToken: () => sessionRef.current?.accessToken ?? null,
      // Every request that hit the expired token shares one refresh call.
      refreshAccessToken: () => {
        inflightRefresh.current ??= refresh().finally(() => {
          inflightRefresh.current = null;
        });

        return inflightRefresh.current;
      },
    });
  }, [clearSession, setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, setSession, clearSession }),
    [session, setSession, clearSession],
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
