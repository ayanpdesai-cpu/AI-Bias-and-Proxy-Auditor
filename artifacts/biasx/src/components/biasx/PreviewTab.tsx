import { Table2 } from "lucide-react";
import type { ColumnType, ParsedData } from "@/lib/audit";
import { TypeToggle } from "./TypeToggle";

export function PreviewTab({ data, target, onType }: { data: ParsedData | null; target: string; onType: (c: string, t: ColumnType) => void }) {
  if (!data) {
    return (
      <div className="flex items-center gap-3 p-8 text-gray-400">
        <Table2 className="w-8 h-8 shrink-0" aria-hidden="true" />
        <p className="text-sm">No dataset loaded. Upload a CSV or choose an example to preview its rows.</p>
      </div>
    );
  }
  const numeric = data.numericColumns.length;
  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 text-sm text-gray-600">
        <span>Rows: <strong className="text-gray-900">{data.rows.length}</strong></span>
        <span className="text-gray-300" aria-hidden="true">·</span>
        <span>Columns: <strong className="text-gray-900">{data.columns.length}</strong></span>
        <span className="text-gray-300" aria-hidden="true">·</span>
        <span>Numeric: <strong className="text-gray-900">{numeric}</strong></span>
        <span className="text-gray-300" aria-hidden="true">·</span>
        <span>Categorical: <strong className="text-gray-900">{data.columns.length - numeric}</strong></span>
      </div>
      {data.notes.length > 0 && (
        <ul className="mb-4 space-y-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid="list-data-notes">
          {data.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <caption className="sr-only">First 12 rows of {data.fileName}</caption>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {data.columns.map(col => (
                <th key={col} scope="col" className={`px-3 py-2.5 text-left font-bold whitespace-nowrap ${col === target ? "text-indigo-600" : "text-gray-600"}`}>
                  <div className="flex items-center gap-1.5">
                    <code>{col}</code>
                    {col === target && <span className="text-indigo-400 font-normal">(target)</span>}
                    <TypeToggle column={col} value={data.columnTypes[col]} onChange={t => onType(col, t)} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 12).map((row, i) => (
              <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                {data.columns.map(col => (
                  <td key={col} className={`px-3 py-2 font-mono whitespace-nowrap ${col === target ? "text-indigo-700 font-semibold" : "text-gray-700"}`}>
                    {row[col] ?? <span className="text-gray-300" title="Missing value">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rows.length > 12 && <p className="mt-2 text-xs text-gray-400">Showing the first 12 of {data.rows.length} rows.</p>}
    </div>
  );
}
