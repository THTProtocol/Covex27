# Next ZK Circuits Roadmap (Phase 7)

## Priority Order (Post-Launch)

### 1. Range Proof (High Priority)
- Use case: Collateral sufficiency, private balance ranges, KYC-free tier qualification
- Relatively easy to implement on top of existing Groth16 setup
- High practical value

### 2. Age Verification (Medium-High)
- Specialized range proof on birthdate
- Very strong real-world use case (age-gated services without revealing exact age)

### 3. Basic Verifiable Compute (Medium)
- Start with RISC0 or SP1 stubs for simple programs
- Goal: Prove correct execution of small off-chain logic

### 4. More Complex Circuits (Longer Term)
- Full Merkle tree membership with path
- Multi-party computations
- Game-specific circuits (once silverc can better support them)

## Implementation Guidelines
- Every new circuit must come with:
  - Clear honesty labeling
  - Working oracle verification path
  - Example usage in Terminal
  - Documentation in this repo

## Current Limitation
All circuits will remain oracle-attested until silverc + Kaspa scripting can support richer on-chain verification.

---

Update this document as circuits are implemented.
