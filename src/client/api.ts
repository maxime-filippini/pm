import { useEffect, useState } from "react";

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

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => api<Me>("/api/me").then(setMe, (e: Error) => setError(e.message));
  useEffect(() => {
    void reload();
  }, []);
  return { me, error, reload };
}
