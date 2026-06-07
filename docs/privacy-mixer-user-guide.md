# Privacy Mixer — User Guide (Covex27)

## What it does

The Covex Privacy Mixer lets you deposit KAS into a shared pool and later withdraw to a new address using a zero-knowledge proof. The proof shows your deposit exists in the pool **without revealing which deposit was yours**.

## Quick start

### 1. Generate a deposit note

```bash
cd zk/privacy_mixer
node scripts/prove_deposit.js [secret] [nullifier_key] [amount_sompi]
```

Save the JSON output **offline**. You need `secret` and `nullifier_key` to withdraw.

### 2. Deposit KAS + register leaf

Send KAS to the mixer covenant, then register your leaf:

```bash
curl -X POST https://hightable.pro/api/mixer/deposit \
  -H 'Content-Type: application/json' \
  -d '{"covenant_id":"YOUR_COVENANT_ID","leaf_hash":"LEAF_FROM_STEP_1"}'
```

### 3. Generate withdraw proof

```bash
node scripts/prove_withdraw.js <secret> <nullifier_key> <amount> <recipient_hash>
```

### 4. Submit to oracle

```bash
curl -X POST https://hightable.pro/api/oracle/verify-and-sign \
  -H 'Content-Type: application/json' \
  -d '{"covenant_id":"...","circuit_type":"privacy_mixer_v1","proof":{...},"public_inputs":[...]}'
```

Use `public_inputs` from the proof's `publicSignals` array.

## Privacy guarantees

**Provided:**
- ZK proof of pool membership without revealing leaf index (to verifiers)
- Public nullifier prevents double-withdraw of the same note
- Optional hidden amount via commitment + range proof

**Not provided:**
- Perfect anonymity (depends on pool size, timing, amount correlation)
- On-chain nullifier set (v1 uses oracle database)
- SHA256/script-hash compatibility (uses MiMC7)

## Fixed-denomination pools

Set `min_amount == max_amount` in the proof for standard mixer denominations (e.g. 1 KAS).

## Support

Circuit: `privacy_mixer_v1` | Verifier: `zk/verify_privacy_mixer.js` | Design: `docs/privacy-mixer-design.md`