import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AuditResult } from "@/lib/audit";

const SIG_COLORS: Record<string, string> = { "Pearson r": "#6366f1", "MI (bits)": "#f59e0b", "Disparity": "#ef4444" };
const RISK_FILL: Record<string, string> = { high: "#dc2626", medium: "#f59e0b", low: "#10b981" };

export function FeatureRiskChart({ results, currentTarget }: { results: AuditResult[]; currentTarget: string }) {
  const data = results.map(r => ({
    name: r.name,
    "Pearson r": r.pearsonApplicable ? parseFloat(r.corr.toFixed(3)) : null,
    "MI (bits)": parseFloat(r.mi.toFixed(3)),
    "Disparity": r.disp != null ? parseFloat(r.disp.toFixed(3)) : null,
    risk: r.risk,
  }));
  const axisMax = results.reduce((max, result) => Math.max(max, result.mi), 1);
  return (
    <div>
      <h2 className="text-sm font-bold text-gray-800 mb-0.5">Feature Risk Scores</h2>
      <p className="text-xs text-gray-500 mb-3">
        Three screening scores per feature vs. <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{currentTarget}</code>. Pearson r is colour-coded by risk level. Unavailable measures are omitted. Pearson and disparity range from 0 to 1; MI is measured in bits and can exceed 1.
      </p>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 360 }}>
          <ResponsiveContainer width="100%" height={Math.max(160, data.length * 52)}>
            <BarChart layout="vertical" data={data} margin={{ top: 0, right: 32, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" domain={[0, axisMax]} tick={{ fontSize: 10 }} tickFormatter={v => v.toFixed(1)} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => [v.toFixed(3), name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {(["Pearson r", "MI (bits)", "Disparity"] as const).map(key => (
                <Bar key={key} dataKey={key} fill={SIG_COLORS[key]} radius={[0, 4, 4, 0]}>
                  {data.map(d => (
                    <Cell key={d.name} fill={key === "Pearson r" ? RISK_FILL[d.risk] : SIG_COLORS[key]} fillOpacity={key === "Pearson r" ? 1 : 0.55} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Pearson r:</span>
        {[["High", "#dc2626"], ["Medium", "#f59e0b"], ["Low", "#10b981"]].map(([l, c]) => (
          <div key={l} className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />{l}
          </div>
        ))}
        <span className="text-xs text-gray-500 ml-2 font-medium">Others:</span>
        {[["MI", "#f59e0b"], ["Disparity", "#ef4444"]].map(([l, c]) => (
          <div key={l} className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm opacity-55" style={{ backgroundColor: c }} />{l}
          </div>
        ))}
      </div>
    </div>
  );
}
