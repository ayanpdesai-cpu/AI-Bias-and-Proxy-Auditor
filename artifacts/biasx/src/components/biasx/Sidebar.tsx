import { useRef, useState } from "react";
import { AlertTriangle, Database, FileText, RefreshCw, Upload } from "lucide-react";
import { EXAMPLE_DATASETS } from "@/lib/examples";
import type { ColumnType, ParsedData } from "@/lib/audit";
import { TargetSelect } from "./TargetSelect";
import { TypeToggle } from "./TypeToggle";

interface Props {
  data: ParsedData | null;
  error: string;
  onFile: (f: File) => void;
  onExample: (id: string) => void;
  target: string;
  onTarget: (c: string) => void;
  threshold: number;
  onThreshold: (t: number) => void;
  onType: (col: string, t: ColumnType) => void;
  counts: { high: number; medium: number; low: number } | null;
}

export function Sidebar({ data, error, onFile, onExample, target, onTarget, threshold, onThreshold, onType, counts }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <aside aria-label="Data and audit settings" className="w-full md:w-[248px] bg-white border-b md:border-b-0 md:border-r border-gray-200 flex flex-col shrink-0 md:overflow-y-auto">
      <div className="px-4 pt-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Data Input</p>
        {data ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
              <FileText className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-emerald-800 truncate" data-testid="text-filename">{data.fileName}</div>
                <div className="text-xs text-emerald-600">{data.rows.length} rows · {data.columns.length} cols</div>
              </div>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} data-testid="button-replace-file"
              className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 py-1 font-medium transition-colors">
              <RefreshCw className="w-3 h-3" aria-hidden="true" /> Replace file
            </button>
          </div>
        ) : (
          <button type="button" data-testid="dropzone-csv"
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors ${dragging ? "border-indigo-400 bg-indigo-100" : "border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100"}`}>
            <Upload className="w-5 h-5 text-indigo-500" aria-hidden="true" />
            <span className="text-center">
              <span className="block text-xs font-semibold text-indigo-700">Upload a CSV file</span>
              <span className="block text-xs text-indigo-400 mt-0.5">or drag &amp; drop</span>
            </span>
          </button>
        )}
        {error && (
          <p role="alert" data-testid="text-upload-error" className="mt-2 text-xs text-red-600 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" /><span>{error}</span>
          </p>
        )}
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Choose a CSV file" data-testid="input-file"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </div>

      <div className="px-4 pt-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Database className="w-3 h-3" aria-hidden="true" /> Example Datasets
        </p>
        <div className="space-y-2">
          {EXAMPLE_DATASETS.map(ex => (
            <button key={ex.id} type="button" onClick={() => onExample(ex.id)} data-testid={`button-example-${ex.id}`}
              aria-pressed={data?.fileName === ex.fileName}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${data?.fileName === ex.fileName ? "bg-indigo-50 border-indigo-300 text-indigo-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"}`}>
              <div className="font-semibold">{ex.label}</div>
              <div className="text-gray-500 mt-0.5 leading-relaxed">{ex.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 flex-1">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configure Audit</p>
        {data ? (
          <div className="space-y-5">
            <TargetSelect columns={data.columns} types={data.columnTypes} value={target} onChange={onTarget} />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="threshold" className="text-xs font-medium text-gray-600">Pearson Threshold</label>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full" data-testid="text-threshold">{threshold.toFixed(2)}</span>
              </div>
              <input id="threshold" type="range" min={0.5} max={1.0} step={0.05} value={threshold}
                onChange={e => onThreshold(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0.50</span><span>1.00</span></div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-0.5">Column types</p>
              <p className="text-xs text-gray-400 mb-2 leading-snug">Correct a guess and results update at once.</p>
              <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {data.columns.map(col => (
                  <li key={col} className="flex items-center justify-between gap-2">
                    <code className={`text-xs truncate ${col === target ? "text-indigo-600 font-bold" : "text-gray-700"}`} title={col}>{col}</code>
                    <TypeToggle column={col} value={data.columnTypes[col]} onChange={t => onType(col, t)} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 leading-relaxed">Load a dataset to choose a target and adjust column types.</p>
        )}
      </div>

      {counts && (
        <div className="px-4 pb-4 pt-4" aria-label="Risk summary">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 text-center">
              <div className="text-2xl font-bold text-red-600" data-testid="count-high">{counts.high}</div>
              <div className="text-xs text-red-500 font-medium">High</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
              <div className="text-2xl font-bold text-amber-500" data-testid="count-medium">{counts.medium}</div>
              <div className="text-xs text-amber-600 font-medium">Medium</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
              <div className="text-2xl font-bold text-emerald-600" data-testid="count-low">{counts.low}</div>
              <div className="text-xs text-emerald-600 font-medium">Low</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
