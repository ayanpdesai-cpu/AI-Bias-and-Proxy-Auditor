import type { ColumnType } from "@/lib/audit";

export function TypeToggle({ column, value, onChange }: { column: string; value: ColumnType; onChange: (t: ColumnType) => void }) {
  const opt = (t: ColumnType, label: string, on: string) => (
    <button
      type="button"
      aria-pressed={value === t}
      aria-label={`Treat ${column} as ${t}`}
      data-testid={`button-type-${label.toLowerCase()}-${column}`}
      onClick={() => onChange(t)}
      className={`px-1.5 py-0.5 text-[10px] font-bold leading-none transition-colors ${value === t ? on : "bg-white text-gray-400 hover:text-gray-700"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={`Type of ${column}`} className="inline-flex rounded border border-gray-200 overflow-hidden shrink-0">
      {opt("numeric", "NUM", "bg-emerald-100 text-emerald-700")}
      {opt("categorical", "CAT", "bg-amber-100 text-amber-700")}
    </div>
  );
}
