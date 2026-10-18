import { BookOpen, ChevronDown, ChevronUp, Search, ShieldCheck, Activity, Link2, Scale, Tag } from "lucide-react";

const METHODS = [
  { Icon: Activity, t: "Pearson Correlation", d: "Linear link between feature and outcome (numeric and binary columns)" },
  { Icon: Link2, t: "Mutual Information", d: "Non-linear associations Pearson would miss" },
  { Icon: Scale, t: "Group Disparity", d: "Outcome-rate gaps between groups, for binary outcomes" },
  { Icon: Tag, t: "Protected Attribute", d: "Name matches a known sensitive field (70+ names)" },
];

export function ProxyInfoBanner({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="proxy-explainer" data-testid="button-toggle-explainer"
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-indigo-50/60 transition-colors">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <BookOpen className="w-4 h-4 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-indigo-900">What is a Proxy Variable? What does this tool do?</p>
          <p className="text-xs text-indigo-500 mt-0.5">Click to {open ? "collapse" : "expand"} the explainer</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" />}
      </button>
      {open && (
        <div id="proxy-explainer" className="px-4 sm:px-5 pb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="bg-white rounded-xl border border-indigo-100 p-4">
            <h2 className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-1.5"><Search className="w-4 h-4" aria-hidden="true" /> What is a Proxy Variable?</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              A <strong>proxy variable</strong> is a dataset column that doesn't directly measure a protected characteristic — but is <em>correlated</em> with one.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed mt-2">
              <strong>Example:</strong> ZIP code doesn't mention race, but due to historical residential segregation it can predict it. A model trained on ZIP codes can learn to discriminate by race <em>without ever seeing race as a column</em>.
            </p>
            <div className="mt-3 bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-700 leading-relaxed">
              <strong>Other common proxies:</strong> last name → ethnicity · parental status → gender · neighbourhood → income/race · criminal record → race
            </div>
          </div>
          <div className="bg-white rounded-xl border border-indigo-100 p-4">
            <h2 className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> What Does BiasX Do?</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              BiasX scans your CSV dataset <strong>before you train a model</strong> and flags features that may carry bias or proxy signals — across <strong>all</strong> columns, numeric and categorical. Flags are prompts for human review, not proof of bias.
            </p>
            <ul className="mt-2 space-y-2">
              {METHODS.map(({ Icon, t, d }) => (
                <li key={t} className="text-xs text-gray-600 flex gap-2">
                  <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-500" aria-hidden="true" />
                  <span><span className="font-semibold">{t}:</span> {d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
