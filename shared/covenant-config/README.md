# @covex/covenant-config (Phase 11)

Shared configuration protocol between **Covex Terminal** and **Covenant Studio**.

## Status
This is the **canonical implementation** for Phase 11 integration work.

## Files

- `covenant-config.schema.json` — JSON Schema (source of truth)
- `covenant-config.ts` — TypeScript + Zod implementation + helpers
- `useCovenantConfig.ts` — React hook (recommended)
- `OpenInStudioButton.tsx` — Example handoff button component

## Usage (Terminal)

```ts
import { CovenantConfig, useCovenantConfig } from '@covex/covenant-config';

const config = CovenantConfig.createDefaultChess(creatorAddress);

// Later, when user clicks "Design in Studio"
<OpenInStudioButton config={config} />
```

## Usage (Studio)

```ts
import { useCovenantConfig } from '@covex/covenant-config';

const { config, loadFromJson } = useCovenantConfig();

// On page load from deep link
const urlConfig = getConfigFromUrl();
if (urlConfig) loadFromJson(urlConfig);
```

## Versioning
Current stable version: **1.0**

See full spec: `docs/specs/PHASE11_SHARED_CONFIG_PROTOCOL.md`

## Next Steps (Phase 11)
- Publish as real npm package
- Add compression + short link support
- Add visual payout tree in v1.1
