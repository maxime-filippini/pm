import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Me = {
  email: string;
  member: { id: string; email: string; name: string } | null;
  workspaces: Array<{ id: string; slug: string; name: string }>;
  isAdmin: boolean;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

const MeContext = createContext<{ me: Me | null; error: string | null; reload: () => Promise<void> } | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => api<Me>("/api/me").then((value) => { setMe(value); setError(null); }, (e: Error) => setError(e.message)), []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return createElement(MeContext.Provider, { value: { me, error, reload } }, children);
}

export function useMe() {
  const identity = useContext(MeContext);
  if (!identity) throw new Error("useMe requires MeProvider");
  return identity;
}
