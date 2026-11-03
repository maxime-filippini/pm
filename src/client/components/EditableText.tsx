import { useEffect, useState } from "react";

type FieldProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

/** Local draft while focused; saves on blur (and Enter for single-line). Follows remote changes otherwise. */
export function EditableText({ value, onSave, render, multiline }: { value: string; onSave: (v: string) => void; render: (p: FieldProps) => React.ReactNode; multiline?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (draft === value) setDraft(null);
  }, [value, draft]);
  const save = () => {
    if (draft !== null && draft !== value && (multiline || draft.trim())) onSave(draft);
    setDraft(null);
  };
  return render({
    value: draft ?? value,
    onChange: (e) => setDraft(e.target.value),
    onBlur: save,
    onKeyDown: (e) => {
      if (e.key === "Escape") setDraft(null);
      if (e.key === "Enter" && !multiline) (e.target as HTMLElement).blur();
    },
  });
}
