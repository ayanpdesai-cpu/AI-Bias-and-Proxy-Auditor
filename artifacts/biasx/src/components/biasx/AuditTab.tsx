import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { DISP_HIGH, DISP_MED, MI_HIGH, MI_MED, type AuditResult, type RiskLevel, type TargetInfo } from "@/lib/audit";
import { getBiasReason, getMediumRiskReason } from "@/lib/knowledge";

function CorrelationBar({ value, risk, na }: { value: number; risk: RiskLevel; na: boolean }) {
  const bar =
    risk === "high" ? "bg-gradient-to-r from-red-400 to-red-600" :
    risk === "medium" ? "bg-gradient-to-r from-amber-400 to-orange-400" :
    "bg-gradient-to-r from-emerald-400 to-emerald-500";
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden" role="img" aria-label={na ? "Pearson r not applicable" : `Pearson r ${value.toFixed(2)}`}>
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${na ? 0 : value * 100}%` }} />
      </div>
      <span className="text-sm font-mono font-bold text-gray-700 w-12 text-right shrink-0">{na ? "N/A" : value.toFixed(2)}</span>
    </div>
  );
}

export function AuditTab({ results, threshold, targetInfo, hasData }: { results: AuditResult[]; threshold: number; targetInfo: TargetInfo | null; hasData: boolean }) {
  const noFlags = results.length > 0 && results.every(r => r.risk === "low");
  return (
    <div className="p-4 sm:p-5 space-y-3">
      {noFlags && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl" data-testid="banner-no-flags">
          <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-emerald-800">No features were flagged at the current settings</p>
            <p className="text-sm text-emerald-700 mt-0.5">All {results.length} features scored low at threshold {threshold.toFixed(2)}. That is not evidence the data is fair; it only means these checks found nothing to flag.</p>
          </div>
        </div>
      )}
      {results.map(r => {
        const cardBg = r.risk === "high" ? "bg-red-50 border-red-200" : r.risk === "medium" ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200";
        const codeBg = r.risk === "high" ? "bg-red-100 text-red-800" : r.risk === "medium" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-800";
        const sigColor = r.risk === "high" ? "text-red-600 bg-red-50 border-red-200" : r.risk === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-500 bg-gray-50 border-gray-200";
        return (
          <article key={r.name} data-testid={`card-feature-${r.name}`} className={`rounded-xl border p-4 shadow-sm ${cardBg}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {r.risk === "high" && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> HIGH RISK</span>}
              {r.risk === "medium" && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> MEDIUM RISK</span>}
              {r.risk === "low" && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> LOW RISK</span>}
              <span className="text-xs text-gray-400" aria-hidden="true">|</span>
              <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded break-all ${codeBg}`}>{r.name}</code>
              {r.isEncoded && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">categorical</span>}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${sigColor}`} title={r.pearsonApplicable ? undefined : "Pearson is not meaningful for a nominal category with more than two values"}>
                {r.pearsonApplicable ? `Pearson r = ${r.corr.toFixed(3)}` : "Pearson r = N/A"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${r.mi >= MI_HIGH ? "text-red-600 bg-red-50 border-red-200" : r.mi >= MI_MED ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-500 bg-gray-50 border-gray-200"}`}>MI = {r.mi.toFixed(3)} bits</span>
              {r.disp !== null && <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${r.disp >= DISP_HIGH ? "text-red-600 bg-red-50 border-red-200" : r.disp >= DISP_MED ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-500 bg-gray-50 border-gray-200"}`} title="Max minus min positive-outcome rate across groups">Disparity = {(r.disp * 100).toFixed(1)}%</span>}
            </div>
            <CorrelationBar value={r.corr} risk={r.risk} na={!r.pearsonApplicable} />
            {r.triggers.length > 0 && (
              <div className="mt-2.5 space-y-1">
                {r.triggers.map((t, i) => (
                  <p key={i} className={`text-xs leading-relaxed rounded-lg px-3 py-1.5 border ${sigColor}`}>
                    <span className="font-semibold">⚑ Signal {i + 1}:</span> {t}
                  </p>
                ))}
              </div>
            )}
            {(r.risk === "high" || r.risk === "medium") && (
              <p className={`text-xs leading-relaxed rounded-lg px-3 py-2 mt-1.5 border ${r.risk === "high" ? "text-red-800 bg-red-50 border-red-200" : "text-amber-800 bg-amber-50 border-amber-200"}`}>
                <span className="font-semibold">Why this feature warrants further review:</span>{" "}
                {r.risk === "high" ? getBiasReason(r.name) : getMediumRiskReason(r.name)}
              </p>
            )}
          </article>
        );
      })}
      {results.length > 0 && (
        <details className="text-xs text-gray-500 leading-relaxed">
          <summary className="cursor-pointer font-medium">About these scores</summary>
          <p className="mt-1">Flags are statistical signals for human review. They do not prove bias, and a low-risk label does not show that a feature is fair. {targetInfo?.note}</p>
        </details>
      )}
      {results.length === 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800" data-testid="empty-state">
          <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>{hasData ? "Nothing to audit:" : "Getting Started:"}</strong>{" "}
            {hasData ? "pick a target and make sure the dataset has at least one other column." : "Pick an example dataset from the sidebar or upload your own CSV."}
          </span>
        </div>
      )}
    </div>
  );
}
