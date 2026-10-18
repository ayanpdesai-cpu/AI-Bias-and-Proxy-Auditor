import { useId } from "react";

export function BiasXLogo({ size = 32 }: { size?: number }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BiasX logo">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill={`url(#${gid})`} />
      <rect x="6" y="26" width="5" height="7" rx="1.5" fill="white" fillOpacity="0.5" />
      <rect x="13" y="20" width="5" height="13" rx="1.5" fill="white" fillOpacity="0.7" />
      <rect x="20" y="14" width="5" height="19" rx="1.5" fill="white" fillOpacity="0.9" />
      <circle cx="31" cy="11" r="7.5" fill="#ef4444" />
      <line x1="27.5" y1="7.5" x2="34.5" y2="14.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="34.5" y1="7.5" x2="27.5" y2="14.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
