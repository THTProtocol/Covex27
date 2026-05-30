/**
 * OpenInStudioButton
 * 
 * Reusable button component for Phase 11.
 * Place this in Covex Terminal wherever you want the "Design in Studio" action.
 */

import React from 'react';
import { CovenantConfigV1 } from './covenant-config';

interface OpenInStudioButtonProps {
  config: CovenantConfigV1;
  studioBaseUrl?: string;
  className?: string;
  children?: React.ReactNode;
}

export const OpenInStudioButton: React.FC<OpenInStudioButtonProps> = ({
  config,
  studioBaseUrl = 'https://studio.covex.pro',
  className,
  children = 'Design Beautiful UI in Covenant Studio',
}) => {
  const handleClick = () => {
    // For Phase 11 MVP we use URL param with base64 encoded config.
    // In production this should use short-link backend (Task 11.11).
    const configJson = JSON.stringify(config);
    const encoded = btoa(configJson); // Simple encoding for MVP

    const url = `${studioBaseUrl}/import?config=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className={className || "px-6 py-3 rounded-xl bg-[#49EACB] text-black font-bold hover:bg-[#3dd9b8] transition-all"}
    >
      {children}
    </button>
  );
};
