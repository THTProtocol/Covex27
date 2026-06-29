// Pure helper for the covenant explorer's data layer. Kept dependency-free so the
// honesty-critical response interpretation is unit-testable in isolation (no React, no wasm).

// Interpret a /api/covenants response honestly. The backend returns HTTP 200 with
// {"total":0,"covenants":[],"error":"..."} when a DB query fails, so an empty covenants
// array is AMBIGUOUS: it can mean "no covenants" OR "the query errored". Rendering an error
// body as an empty list fabricates a "no covenants yet" state and hides a real backend
// failure (a honesty-gate violation). This makes the distinction explicit and testable.
//
// Returns { error, covenants, total } where error is a user-facing string or null.
export function readCovenantsResponse(data) {
  if (data && typeof data.error === 'string' && data.error.trim()) {
    return { error: 'Could not load covenants. Please try again.', covenants: [], total: 0 };
  }
  const covenants = Array.isArray(data && data.covenants) ? data.covenants : [];
  const rawTotal = data && data.total != null ? Number(data.total) : NaN;
  const total = Number.isFinite(rawTotal) ? rawTotal : covenants.length;
  return { error: null, covenants, total };
}
