import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import BuildStepsRail from '../BuildStepsRail.jsx';

// Regression guard: the rail previously destructured `current` as a step
// number, while useBuildStep returned a step OBJECT. The aria-current
// comparison was always false, so no chip was ever marked the current step
// and the rail was visually present but functionally dead on every in-flow
// route. This test asserts that on /sandbox?phase=deploy, step 3 (Deploy)
// is the one carrying aria-current=step.
function renderAt(pathAndSearch) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathAndSearch]}>
      <BuildStepsRail />
    </MemoryRouter>
  );
}

describe('BuildStepsRail', () => {
  it('marks step 3 (Deploy) as aria-current=step on /sandbox?phase=deploy', () => {
    const html = renderAt('/sandbox?phase=deploy');
    // Exactly one chip carries aria-current=step.
    const currents = html.match(/aria-current="step"/g) || [];
    expect(currents.length).toBe(1);
    // That chip is the Deploy one. Labels appear in chip aria-label.
    expect(html).toMatch(/aria-current="step"[^>]*aria-label="Step 3: Deploy \(current\)"/);
  });

  it('marks step 1 (Create) as aria-current on /sandbox?phase=create', () => {
    const html = renderAt('/sandbox?phase=create');
    expect(html).toMatch(/aria-current="step"[^>]*aria-label="Step 1: Create \(current\)"/);
  });

  it('renders no chip as current on an unmatched route', () => {
    // No phase, not the sandbox default: this should not match any step.
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/about']}>
        <BuildStepsRail />
      </MemoryRouter>
    );
    // The rail returns null when no step matches, so output is empty.
    expect(html).toBe('');
  });
});
