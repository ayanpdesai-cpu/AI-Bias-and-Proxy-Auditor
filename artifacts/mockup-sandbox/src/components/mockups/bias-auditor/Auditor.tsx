import { useState } from "react";
import { Shield, Upload, AlertTriangle, CheckCircle, ChevronDown, BarChart2, FileText, Settings, Info, Zap } from "lucide-react";

const mockFeatures = [
  { name: "zip_code", correlation: 0.91, risk: "high" },
  { name: "neighborhood_id", correlation: 0.87, risk: "high" },
  { name: "years_experience", correlation: 0.43, risk: "low" },
  { name: "test_score", correlation: 0.38, risk: "low" },
  { name: "uses_dark_mode", correlation: 0.82, risk: "high" },
  { name: "coding_score", correlation: 0.31, risk: "low" },
];

const mockRows = [
  { coding_score: 95, uses_dark_mode: 1, zip_code: 10001, approved: 1 },
  { coding_score: 42, uses_dark_mode: 0, zip_code: 90210, approved: 0 },
  { coding_score: 78, uses_dark_mode: 1, zip_code: 10001, approved: 1 },
  { coding_score: 61, uses_dark_mode: 0, zip_code: 30301, approved: 0 },
  { coding_score: 88, uses_dark_mode: 1, zip_code: 10001, approved: 1 },
];

function RiskBadge({ risk }: { risk: string }) {
  if (risk === "high") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" /> HIGH RISK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
      <CheckCircle className="w-3 h-3" /> LOW RISK
    </span>
  );
}

function CorrelationBar({ value, risk }: { value: number; risk: string }) {
  const color = risk === "high" ? "bg-red-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono font-semibold text-gray-700 w-10 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

export function Auditor() {
  const [threshold, setThreshold] = useState(0.75);
  const [targetCol] = useState("approved");
  const [activeTab, setActiveTab] = useState<"results" | "data" | "settings">("results");

  const flagged = mockFeatures.filter((f) => f.correlation >= threshold);
  const safe = mockFeatures.filter((f) => f.correlation < threshold);

  return (
    <div className="min-h-screen bg-gray-50 flex font-['Inter']">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 leading-tight">AI Bias Auditor</div>
            <div className="text-xs text-gray-400">Proxy Variable Detector</div>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="px-4 pt-4">
          <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50 flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-400 hover:bg-indigo-100 transition-colors">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
              <Upload className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-indigo-700">Upload Dataset</div>
              <div className="text-xs text-indigo-500 mt-0.5">CSV format supported</div>
            </div>
          </div>

          {/* Loaded file indicator */}
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
            <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-emerald-800 truncate">hiring_data.csv</div>
              <div className="text-xs text-emerald-600">500 rows · 6 columns</div>
            </div>
          </div>
        </div>

        {/* Config */}
        <div className="px-4 pt-5 flex-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Configuration</div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Target Column</label>
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer">
                <span className="text-sm font-mono text-gray-800">approved</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Risk Threshold</label>
                <span className="text-xs font-bold text-indigo-600">{threshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.0}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>0.50</span>
                <span>1.00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-red-50 rounded-lg p-2.5 text-center">
              <div className="text-xl font-bold text-red-600">{flagged.length}</div>
              <div className="text-xs text-red-500">Flagged</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
              <div className="text-xl font-bold text-emerald-600">{safe.length}</div>
              <div className="text-xs text-emerald-500">Safe</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-base font-bold text-gray-900">Audit Results</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Analyzing <span className="font-semibold text-gray-700">6 features</span> against target{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded text-indigo-700 font-mono text-xs">{targetCol}</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <BarChart2 className="w-3.5 h-3.5" />
              Export Report
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
              <Zap className="w-3.5 h-3.5" />
              Re-run Audit
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 px-6 flex gap-0 shrink-0">
          {(["results", "data", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "results" && <BarChart2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
              {tab === "data" && <FileText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
              {tab === "settings" && <Settings className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "results" && (
            <div className="space-y-4 max-w-3xl">
              {/* Info banner */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <span className="font-semibold">{flagged.length} feature{flagged.length !== 1 ? "s" : ""} flagged</span>{" "}
                  with correlation ≥ {threshold.toFixed(2)}. These may act as proxy variables that encode hidden bias into your model.
                </div>
              </div>

              {/* Flagged Features */}
              {flagged.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                    🚨 High Risk Features
                  </h2>
                  <div className="space-y-2">
                    {flagged.map((f) => (
                      <div
                        key={f.name}
                        className="bg-white border border-red-200 rounded-xl p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                              {f.name}
                            </code>
                            <RiskBadge risk={f.risk} />
                          </div>
                        </div>
                        <CorrelationBar value={f.correlation} risk={f.risk} />
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                          This feature strongly influences the AI's output. If it encodes demographic or
                          location data, it may introduce unfair bias into predictions.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Safe Features */}
              {safe.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                    ✅ Low Risk Features
                  </h2>
                  <div className="space-y-2">
                    {safe.map((f) => (
                      <div
                        key={f.name}
                        className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                              {f.name}
                            </code>
                            <RiskBadge risk={f.risk} />
                          </div>
                        </div>
                        <CorrelationBar value={f.correlation} risk={f.risk} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "data" && (
            <div className="max-w-3xl">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Dataset Preview</span>
                  <span className="text-xs text-gray-400">Showing 5 of 500 rows</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {Object.keys(mockRows[0]).map((col) => (
                          <th
                            key={col}
                            className={`px-4 py-2.5 text-left text-xs font-semibold ${
                              col === "approved"
                                ? "text-indigo-600"
                                : "text-gray-600"
                            }`}
                          >
                            <code>{col}</code>
                            {col === "approved" && (
                              <span className="ml-1 text-xs font-normal text-indigo-400">(target)</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mockRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          {Object.entries(row).map(([col, val]) => (
                            <td key={col} className="px-4 py-2.5 text-xs font-mono text-gray-700">
                              {String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="max-w-md space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Correlation Method</h3>
                <div className="space-y-2">
                  {["Pearson (default)", "Spearman", "Kendall"].map((m) => (
                    <label key={m} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="method"
                        defaultChecked={m === "Pearson (default)"}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm text-gray-700">{m}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">Report Options</h3>
                <div className="space-y-3">
                  {["Include correlation matrix", "Show feature distributions", "Generate PDF summary"].map((opt) => (
                    <label key={opt} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-indigo-600" />
                      <span className="text-sm text-gray-700">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
