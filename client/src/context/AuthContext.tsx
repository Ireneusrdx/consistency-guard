/**
 * Auth state: token-backed session.
 *
 * - login/register call the API, persist the token (localStorage when
 *   "remember me" is on, sessionStorage otherwise), and set the user.
 * - logout clears tokens, calls the API best-effort, and clears the user.
 * - On mount, an existing token is validated via me().
 */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi, clearToken, getToken, setToken } from '../lib/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (name: string, email: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async (): Promise<void> => {
    try {
      setUser(await authApi.me());
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getToken()) {
        try {
          const me = await authApi.me();
          if (!cancelled) setUser(me);
        } catch {
          if (!cancelled) setUser(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string, remember: boolean): Promise<void> => {
    const { token, user: nextUser } = await authApi.login(email, password);
    setToken(token, remember);
    setUser(nextUser);
  };

  const register = async (name: string, email: string, password: string, confirmPassword: string): Promise<void> => {
    const { token, user: nextUser } = await authApi.register(name, email, password, confirmPassword);
    setToken(token, true);
    setUser(nextUser);
  };

  const logout = async (): Promise<void> => {
    clearToken();
    try {
      await authApi.logout();
    } catch {
      /* best effort — the local session is already cleared */
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
