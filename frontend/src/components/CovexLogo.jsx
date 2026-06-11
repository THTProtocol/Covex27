import React from 'react';

export default function CovexLogo({ size = 48, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <radialGradient id="covex-disc-grad" cx="65%" cy="25%" r="75%" fx="65%" fy="25%">
          <stop offset="0%" stopColor="#00c9b8" />
          <stop offset="35%" stopColor="#008a7d" />
          <stop offset="70%" stopColor="#004d45" />
          <stop offset="100%" stopColor="#001f1d" />
        </radialGradient>
        <linearGradient id="covex-caustic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,201,184,0.6)" />
          <stop offset="50%" stopColor="rgba(0,201,184,0.1)" />
          <stop offset="100%" stopColor="rgba(0,201,184,0)" />
        </linearGradient>
      </defs>
      {/* Disc background */}
      <rect x="3" y="3" width="42" height="42" rx="8" fill="#00100f" />
      {/* Inner disc with teal gradient */}
      <rect x="6" y="6" width="36" height="36" rx="6" fill="url(#covex-disc-grad)" />
      {/* Hairline caustic ring at bevel */}
      <rect x="6" y="6" width="36" height="36" rx="6" fill="none" stroke="rgba(0,201,184,0.4)" strokeWidth="0.5" />
      {/* C letterform — negative space cutout */}
      <path
        d="M25 16 C29.97 16 34 20.03 34 25 C34 29.97 29.97 34 25 34"
        fill="none"
        stroke="#f0fefd"
        strokeWidth="0.5"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* Genesis highlight dot top-right */}
      <circle cx="36" cy="12" r="1.5" fill="#00c9b8" opacity="0.8" />
      {/* Outer hairline border */}
      <rect x="3" y="3" width="42" height="42" rx="8" fill="none" stroke="rgba(0,201,184,0.15)" strokeWidth="0.5" />
    </svg>
  );
}
