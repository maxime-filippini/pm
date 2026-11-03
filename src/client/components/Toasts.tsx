import { useToasts } from "../store/toasts";

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-md border border-red-500/40 bg-neutral-900 px-4 py-2 text-sm shadow-lg">
          {t.message}
        </div>
      ))}
    </div>
  );
}
