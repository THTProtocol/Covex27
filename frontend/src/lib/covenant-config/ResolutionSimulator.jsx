import React from 'react';

/**
 * ResolutionSimulator
 * Shows what happens under different outcomes based on the config.
 * This is a simplified but honest simulator for the current oracle-attested model.
 */
export default function ResolutionSimulator({ config }) {
  if (!config || !config.resolution) {
    return <div className="text-gray-400 text-sm">No resolution config loaded</div>;
  }

  const { resolution, covenant } = config;
  const { payoutModel, mode, circuit } = resolution;

  const fee = (payoutModel?.feeBasisPoints || 0) / 100;

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl p-5 text-sm">
      <div className="font-semibold text-white mb-3">Resolution Preview (Simulated)</div>

      <div className="space-y-3 text-gray-300">
        <div>
          <span className="text-gray-400">Circuit:</span>{' '}
          <span className="text-[#49EACB]">{circuit?.type || 'unknown'}</span>
        </div>
        <div>
          <span className="text-gray-400">Mode:</span> {mode}
        </div>
        <div>
          <span className="text-gray-400">Platform Fee:</span> {fee}%
        </div>

        <div className="pt-2 border-t border-white/10">
          <div className="font-medium text-white mb-1">Payout Scenarios:</div>
          <div className="pl-2 space-y-1 text-xs">
            {payoutModel?.type === 'winner_takes_all' && (
              <>
                <div>• Outcome 0 (Success): Winner receives 100% of pot minus fee</div>
                <div>• Outcome 1 (Fail/Timeout): Depositor/Other party receives remainder</div>
              </>
            )}
            {payoutModel?.type === 'proportional' && (
              <div>• Funds distributed proportionally according to shares defined in script</div>
            )}
            <div className="text-amber-400/80 mt-2">
              Note: This is a simulation. Actual resolution uses the configured oracle/ZK path.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
