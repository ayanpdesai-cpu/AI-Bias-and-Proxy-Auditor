import { useMemo } from "react";
import { buildHeatmap, corrToColor, type ParsedData } from "@/lib/audit";

export function CorrelationHeatmap({ data, cols }: { data: ParsedData; cols: string[] }) {
  const columns = useMemo(() => [...new Set(cols)].filter(c => data.columns.includes(c)), [cols, data.columns]);
  const matrix = useMemo(() => buildHeatmap(data, columns), [data, columns]);

  if (columns.length < 2) return <p className="text-xs text-gray-500">Heatmap requires at least 2 dataset columns.</p>;

  const cellSz = Math.min(58, Math.max(34, Math.floor(640 / Math.max(columns.length, 1))));
  const labelW = Math.max(88, Math.min(140, cellSz * 2));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-0.5">
        <h2 className="text-sm font-bold text-gray-800">Feature Association Heatmap</h2>
        <span className="text-xs text-gray-500">{columns.length} of {data.columns.length} dataset columns</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Every dataset variable is included. Numeric pairs and binary categories use absolute Pearson r; nominal categories (more than two values) use normalized mutual information instead of an arbitrary ordering. Hover over a cell for its measure.
      </p>
      <div className="overflow-auto" role="region" aria-label="Association heatmap" tabIndex={0}>
        <div className="inline-flex flex-col">
          <div className="flex" style={{ marginLeft: labelW }}>
            {columns.map(col => (
              <div key={col} style={{ width: cellSz, minWidth: cellSz }} className="text-center px-0.5">
                <span className="text-[10px] text-gray-500 block truncate" title={`${col} · ${data.columnTypes[col]}`}>{col.slice(0, 8)}</span>
              </div>
            ))}
          </div>
          {matrix.map((row, i) => (
            <div key={columns[i]} className="flex items-center">
              <div style={{ width: labelW, minWidth: labelW }} className="text-[10px] text-gray-600 truncate pr-2 text-right shrink-0" title={`${columns[i]} · ${data.columnTypes[columns[i]]}`}>
                {columns[i]}
              </div>
              {row.map(({ value, method }, j) => (
                <div key={j} style={{ width: cellSz, height: cellSz, minWidth: cellSz, backgroundColor: i === j ? "#4f46e5" : corrToColor(value), border: "1px solid #e5e7eb" }}
                  className="flex items-center justify-center cursor-default" title={`${columns[i]} × ${columns[j]} · ${method}: ${value.toFixed(3)}`}>
                  <span style={{ color: (i === j || value > 0.55) ? "#fff" : "#374151", fontSize: cellSz < 46 ? "9px" : "11px" }} className="font-mono font-bold">{value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-gray-500">Low</span>
          <div className="flex h-3 rounded overflow-hidden" style={{ width: 120 }}>
            {Array.from({ length: 12 }, (_, k) => <div key={k} style={{ flex: 1, backgroundColor: corrToColor(k / 11) }} />)}
          </div>
          <span className="text-xs text-gray-500">High</span>
          <div className="w-5 h-3 rounded ml-4" style={{ backgroundColor: "#4f46e5" }} />
          <span className="text-xs text-gray-500">Self association (diagonal)</span>
        </div>
      </div>
    </div>
  );
}
