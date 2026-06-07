# Privacy Mixer — Architecture & Design (Covex27 / Kaspa)

**Version:** M0 — June 2026  
**Circuit:** `privacy_mixer_v1.circom`  
**Model:** Hybrid (Groth16 proof + oracle attestation fallback)

## 1. Goals

Allow users to **deposit** KAS into a covenant-backed mixer pool and **withdraw** to a fresh address with:

- **Unlinkability:** withdrawal is not cryptographically linkable to deposit tx (within anonymity set)
- **Double-spend prevention:** each deposit note spent at most once via public **nullifier**
- **Optional hidden amounts:** MiMC7 commitment + 64-bit range proof (denomination pools)

## 2. Threat Model & Honest Limits

| Guarantee | Provided? | Notes |
|-----------|-----------|-------|
| ZK soundness of membership | Yes (Groth16) | MiMC7 Merkle path, depth 16 |
| Nullifier uniqueness | Hybrid | Oracle DB + covenant policy; not full on-chain nullifier set yet |
| Amount privacy | Optional | Range proof on committed amount; fixed-denom pools simpler |
| Anonymity | Partial | Depends on pool size, timing, amount correlation |
| Trusted setup | Dev PTAU | Same ceremony posture as other Covex circuits |
| On-chain Groth16 verify | No (v1) | Oracle verifies proof; covenant unlocks on signed outcome |

## 3. Data Flow

```
DEPOSIT                          WITHDRAW
───────                          ────────
User generates:                   User provides:
  secret (256-bit)                  secret, nullifier_key (from deposit)
  nullifier_key                     Merkle path witness
  amount (optional)                 recipient_hash (public)
       │                            withdrawal proof (Groth16)
       ▼                                   │
commitment = H(secret, nullifier_key,     ▼
             amount_commitment)      Oracle verifies:
       │                              - Groth16 valid
       ▼                              - nullifier not spent
leaf = MiMC7(commitment)              - inserts nullifier
       │                                   │
       ▼                                   ▼
Off-chain tree builder            Covenant unlock(outcome=0)
updates Merkle root                      │
       │                                   ▼
Covenant records root (public)    Payout to recipient
```

## 4. Cryptographic Primitives

All hashes use **MiMC7(91)** (matches existing Covex circuits).

| Value | Formula |
|-------|---------|
| `amount_commitment` | `MiMC7(amount)` |
| `commitment` | chain: `h0=0; h1=MiMC(h0+secret); h2=MiMC(h1+nullifier_key); h3=MiMC(h2+amount_commitment)` |
| `leaf` | `MiMC7(commitment)` |
| `nullifier` | `MiMC7(secret + nullifier_key)` (public at withdraw) |
| `recipient_hash` | `MiMC7(recipient_pubkey_bytes)` (public) |
| Merkle node | `MiMC7(left + right)` |

**Tree:** binary Merkle, depth **16** (65536 leaves max). Empty subtrees use **zero leaf** convention.

## 5. Circuit Public Inputs (`privacy_mixer_v1`)

| Index | Name | Role |
|-------|------|------|
| 0 | `merkle_root` | Current pool root |
| 1 | `nullifier` | Prevents double-spend |
| 2 | `recipient_hash` | Withdrawal destination binding |
| 3 | `amount_commitment` | Hidden amount binding (or 0 for public denom) |
| 4 | `min_amount` | Range lower bound |
| 5 | `max_amount` | Range upper bound |
| 6 | `mixer_valid` | Output flag (=1 when all constraints pass) |

**Private witness:** `secret`, `nullifier_key`, `amount`, `path_elements[16]`, `path_indices[16]`

## 6. Covenant Integration (M3)

**Contract:** `PrivacyMixerCovenant`

- **Outcomes:** `0 = WithdrawAuthorized`, `1 = Rejected`
- **Unlock:** requires oracle signature over `(covenant_id, outcome=0, timestamp)`
- **Params:** `feeBasisPoints`, `minLock`, `merkleRoot` (updated on each deposit batch)
- **Policy:** only outcome 0 releases pool funds to `recipient` embedded in witness/off-chain tx builder

SilverScript follows existing `emit_merkle` pattern: outcome-gated `unlock()` with oracle witness.

## 7. Backend / Oracle (M4)

**Circuit type:** `privacy_mixer_v1`

1. If proof has `pi_a`: run `zk/verify_privacy_mixer.js`
2. Check `mixer_valid == 1` in public signals
3. Query `mixer_nullifiers` table — reject if nullifier exists
4. Insert nullifier on success
5. Sign outcome `0` (authorized)

**New DB table:** `mixer_nullifiers (nullifier TEXT PRIMARY KEY, covenant_id TEXT, spent_at INTEGER)`

**API endpoints:**
- `POST /api/mixer/deposit` — register leaf + return updated root (off-chain tree)
- `GET /api/mixer/root/:covenant_id` — current Merkle root
- `GET /api/mixer/status` — pool stats

## 8. Frontend (M5)

- Register `privacy_mixer_v1` in `CovexTerminal.jsx` (`full-zk`, `artifacts: true`)
- New `PrivacyMixerPanel.jsx`: deposit note generator, withdraw proof flow
- Covenant builder case for `privacy_mixer_v1` → `PrivacyMixerCovenant`

## 9. Constraint Budget Estimate

| Component | ~Constraints |
|-----------|-------------|
| Merkle path (16 levels) | ~5,800 |
| Nullifier derivation | ~400 |
| Commitment chain | ~1,200 |
| Range proof (64-bit) | ~130 |
| **Total** | **~7,500–10,000** |

Well under 150k target.

## 10. Deployment Checklist (M8)

- [ ] Compile + `setup_mixer.sh` → vkey committed
- [ ] Oracle handler + nullifier DB
- [ ] Frontend panel + circuit registration
- [ ] E2E test: deposit → withdraw
- [ ] Triple-sync: GitHub + Hetzner

## 11. Future Work

- On-chain nullifier set (Kaspa state covenant)
- SHA256 compatibility layer for script-hash HTLCs
- Multi-denom pools with separate roots
- Production PTAU ceremony