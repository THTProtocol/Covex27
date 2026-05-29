# Oracle Rate Limiting — Design & Implementation Notes (Phase 6)

The oracle verification endpoint (`POST /oracle/verify-and-sign`) calls out to Node.js snarkjs to verify Groth16 proofs. Each call spawns a subprocess and runs CPU-intensive crypto. This makes it the most expensive and most abuse-prone endpoint in the system.

## Current (Phase 6) Implementation

- **Basic in-memory rate limiting**: The Rust backend tracks a simple counter per IP in a `HashMap` wrapped in `Arc<Mutex<>>`.
- **Default limits**: 10 requests per minute per IP for the oracle endpoint.
- **Response on limit exceeded**: HTTP 429 with `{ "success": false, "error": "Rate limit exceeded. Try again later." }`.

## Limitations of In-Memory

- Restart loses state.
- Per-IP only (no user-tier awareness yet).
- Not suitable for multi-instance deployments.

## Production Upgrade Path

When traffic grows or if abuse is detected:

1. **Redis-backed rate limiter**: Replace the in-memory map with Redis (atomic INCR + EXPIRE). Single source of truth across instances.
2. **Tiered limits**: Higher tiers (PRO, MAX) get higher rate limits or priority access.
3. **Proof caching**: Reject duplicate proofs (already verified) to prevent replay of valid proofs.

## Monitoring

Watch for:
- Sudden spikes in oracle requests (alert via `monitor-and-alert.sh`)
- High rate of 429 responses (indicates abuse)
- Long verification times (indicates slow snarkjs or unusual proofs)
