# Contributing to Covex

Thank you for your interest in contributing to Covex!

## Our Philosophy

Covex follows a strict "radical honesty + pragmatic progress" approach.

We will:
- Never claim on-chain ZK enforcement or "trustless" features that do not yet exist.
- Clearly label what is real, what is aspirational, and what are current technical limitations.
- Use the best available tools today (off-chain ZK verification + transparent oracle attestation) to make useful covenants possible right now.
- Continuously push the ecosystem forward as silverc and Kaspa scripting capabilities improve.

If you are not comfortable with this level of honesty in documentation and communication, this may not be the right project for you.

## How to Contribute

### 1. New Real ZK Circuits (Most Valued)

We are especially interested in new production-grade circuits that follow the established pattern:

- Working circuit (circom, gnark, RISC0, SP1, etc.)
- Full proving + verification pipeline
- Oracle verification handler (so it can be used with `/api/oracle/verify-and-sign`)
- Clear honesty labeling of limitations
- Example + documentation

Please open an issue first to discuss the circuit before investing heavy implementation time.

### 2. Improvements to Existing Infrastructure

- Oracle service robustness and performance
- Production tooling (monitoring, deployment, migration scripts)
- Frontend experience in the Terminal (especially the Oracle Resolution flow)
- Documentation and examples

### 3. Documentation & Examples

Clear, honest, well-written documentation and real-world examples are extremely valuable.

### 4. Bug Reports & Feedback

If you find issues (especially around the oracle, proof verification, or mainnet migration), please open a detailed issue.

## Development Setup

See `docs/BUILDING_ON_COVEX.md` for how to run and integrate with the platform locally.

For backend development:
```bash
cd backend
cargo check
cargo test
```

For frontend:
```bash
cd frontend
npm install
npm run dev
```

## Pull Request Process

1. Fork the repository and create a feature branch.
2. Make your changes.
3. Ensure `cargo check` (backend) and the frontend build pass.
4. Update documentation where relevant.
5. Open a Pull Request with a clear description of what was changed and why.
6. Be prepared to discuss honesty labeling if your contribution adds new claims about capabilities.

## Code of Conduct

Be respectful. We are building serious infrastructure. Treat the "radical honesty" principle seriously in all communication.

## Questions?

Open an issue or reach out in the project discussions.

Thank you for helping make real, honest covenants on Kaspa possible.
