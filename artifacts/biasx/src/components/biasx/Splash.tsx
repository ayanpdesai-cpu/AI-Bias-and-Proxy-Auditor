import { useEffect, useState } from "react";
import { BiasXLogo } from "./BiasXLogo";

// Fade starts at 1.1s and the overlay is removed at 1.5s.
export function Splash() {
  const [fade, setFade] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => setFade(true), 1100);
    const b = setTimeout(() => setGone(true), 1500);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  if (gone) return null;
  return (
    <div
      role="status"
      aria-label="Loading BiasX"
      data-testid="splash-screen"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        transition: "opacity 0.4s ease",
        opacity: fade ? 0 : 1,
        pointerEvents: fade ? "none" : "all",
      }}
    >
      <div style={{ transform: fade ? "scale(0.95)" : "scale(1)", transition: "transform 0.4s ease" }}>
        <BiasXLogo size={80} />
      </div>
      <div className="mt-5 text-center">
        <div className="text-3xl font-extrabold tracking-tight text-white">
          Bias<span style={{ color: "#fca5a5" }}>X</span>
        </div>
        <p className="mt-1.5 text-indigo-200 text-sm font-medium tracking-wide">AI Bias &amp; Proxy Variable Auditor</p>
      </div>
      <div className="mt-8 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/40"
            style={{ animation: `bx-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
    </div>
  );
}
