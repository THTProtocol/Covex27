/* Lazy boundary for the heavy @measured/puck + puckConfig import (~115KB gz). Rendered only for
   covenants that actually carry creator puck_data, so the puck chunk loads exactly once on those
   pages instead of on every covenant view. */
import { Render as PuckRender } from '@measured/puck';
import puckConfig, { BG_PRESETS } from './puckConfig';

// Lazy boundary for the creator-designed page: a single component switched by `mode` so the
// heavy @measured/puck runtime + puckConfig load exactly once (one chunk) when first needed.
//   mode='surface'    -> the full creator-designed Puck page (blocks resolve {{live}} tokens)
//   mode='background'  -> the page-level background tint from the creator's chosen root preset
export default function PuckSurface({ mode = 'surface', data, liveData, backgroundPresetKey }) {
  if (mode === 'background') {
    const preset = BG_PRESETS[backgroundPresetKey];
    if (!preset) return null;
    return (
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ background: preset.css }}
      />
    );
  }
  return <PuckRender config={puckConfig} data={data} metadata={{ live: liveData }} />;
}
