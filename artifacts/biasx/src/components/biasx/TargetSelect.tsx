import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ColumnType } from "@/lib/audit";

interface Props {
  columns: string[];
  types: Record<string, ColumnType>;
  value: string;
  onChange: (col: string) => void;
}

export function TargetSelect({ columns, types, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div>
      <span id="target-label" className="text-xs font-medium text-gray-600 block mb-1.5">Target variable</span>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} aria-labelledby="target-label"
          data-testid="select-target"
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 hover:border-indigo-400 transition-colors">
          <span className="truncate">{value}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {open && (
          <div role="listbox" aria-labelledby="target-label" className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
            {columns.map(col => {
              const isNum = types[col] === "numeric";
              return (
                <button key={col} type="button" role="option" aria-selected={col === value} data-testid={`option-target-${col}`}
                  onClick={() => { onChange(col); setOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-xs font-mono hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2 ${col === value ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"}`}>
                  <span className="truncate">{col}</span>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${isNum ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{isNum ? "num" : "cat"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
