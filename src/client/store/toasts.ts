import { create } from "zustand";

export type Toast = { id: number; message: string };

let next = 0;

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

export function toast(message: string) {
  const id = ++next;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, message }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
}
