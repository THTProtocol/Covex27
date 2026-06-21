//! Covex compute-core: a tiny deterministic stack machine + the public statement it proves.
//!
//! # What this proves
//! The Covex general verifiable-computation zkVM proves the statement:
//!
//! > "I ran THIS program on THESE public inputs and got THIS output."
//!
//! `THIS program` is pinned by `program_hash = sha256(serialize(program))`, so the proof is bound
//! to one exact program and one exact set of inputs. The guest (in `../methods/guest`) wraps
//! [`run_checked`]: it asserts `sha256(program) == program_hash`, executes the program over the
//! inputs, asserts the computed result equals the caller's `claimed_output`, and only then commits
//! the public [`Statement`] to the journal. Any mismatch (wrong hash, runtime trap, wrong claimed
//! output) makes the guest panic, so NO receipt is produced. A verifying receipt therefore implies
//! the statement is true.
//!
//! # The machine (honest scope)
//! A single deterministic pass over a `Vec<Op>` with:
//!   * an operand **stack** of `u64` (bounded),
//!   * a small **register** file of `u64` (scratch, fixed size [`NUM_REGS`]),
//!   * a read-only **input** tape of `u64` (the public inputs).
//!
//! All arithmetic is wrapping `u64` (two's-complement modular), comparisons push `1`/`0`, and
//! `Div`/`Rem` by zero is a trap (Err, never a silent 0). There are NO loops and NO data-dependent
//! jumps: control flow is exactly the linear op order, so the machine always halts in `ops.len()`
//! steps. This is a deliberate v1 simplification (documented in the README): it covers arbitrary
//! straight-line arithmetic / hashing / comparison predicates and unrolled linear-algebra style
//! computations (the foundation for simple zkML such as a fixed-size dot product or matrix-vector
//! multiply), but not unbounded iteration. Bounded iteration is expressed by unrolling.
//!
//! This crate has NO risc0 dependency. `execute()` / `run_checked()` are ordinary deterministic
//! Rust, so the host can run the exact same code outside the zkVM (and the unit tests below do).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Number of scratch registers (`Load`/`Store` index 0..NUM_REGS). Fixed and public.
pub const NUM_REGS: usize = 16;

/// Maximum operand-stack depth. A program that would exceed this traps (keeps the machine bounded
/// and the guest cycle count predictable).
pub const MAX_STACK: usize = 1024;

/// Maximum number of ops in a program. Bounds total work (one step per op, no loops).
pub const MAX_OPS: usize = 100_000;

/// The instruction set. A `Program` is a `Vec<Op>`; the machine executes them in order, each op
/// consuming/producing operands on the stack. `u64` operands wrap on overflow (modular arithmetic),
/// which is deterministic and matches typical zk-field-free fixed-width semantics.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Op {
    /// Push a constant onto the stack.
    PushConst(u64),
    /// Push `input[i]` (public input tape). Traps if `i` is out of range.
    Load(u32),
    /// Pop `v`; store it into register `r` (does NOT push). Traps if `r >= NUM_REGS`.
    Store(u8),
    /// Push the current value of register `r` (default 0 if never stored). Traps if `r >= NUM_REGS`.
    LoadReg(u8),
    /// Duplicate the top of stack.
    Dup,
    /// Pop and discard the top of stack.
    Pop,
    /// Swap the top two stack entries.
    Swap,

    /// Pop `b`, pop `a`, push `a.wrapping_add(b)`.
    Add,
    /// Pop `b`, pop `a`, push `a.wrapping_sub(b)`.
    Sub,
    /// Pop `b`, pop `a`, push `a.wrapping_mul(b)`.
    Mul,
    /// Pop `b`, pop `a`, push `a / b`. Traps (Err) if `b == 0`.
    Div,
    /// Pop `b`, pop `a`, push `a % b`. Traps (Err) if `b == 0`.
    Rem,

    /// Pop `b`, pop `a`, push `1` if `a < b` else `0`.
    Lt,
    /// Pop `b`, pop `a`, push `1` if `a == b` else `0`.
    Eq,
    /// Pop `b`, pop `a`, push the bitwise AND.
    And,
    /// Pop `b`, pop `a`, push the bitwise OR.
    Or,
    /// Pop `b`, pop `a`, push the bitwise XOR.
    Xor,

    /// Pop the top 8 entries (most-recently-pushed first), interpret each truncated to its low
    /// byte, sha256 those 8 bytes, and push the first 8 bytes of the digest as a big-endian u64.
    /// A fixed-arity hash op keeps the stack effect static; chaining it builds a hash chain. (RISC0
    /// accelerates sha2, so this is the cheap in-ISA hash.) Traps if fewer than 8 entries.
    Hash8,
}

/// A program: an ordered list of ops plus a declared input arity. `num_inputs` is the length of
/// the public input tape the program expects; it is part of the serialized (hashed) program so the
/// program hash binds the expected input shape too.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Program {
    /// Number of public inputs this program reads (the length the input tape must have).
    pub num_inputs: u32,
    /// The ordered instructions.
    pub ops: Vec<Op>,
}

/// What the host writes into the zkVM and the guest reads via `env::read`. It carries the WITNESS
/// (the full program) plus the PUBLIC claims (program hash, inputs, claimed output). The guest
/// re-derives the hash and the output from the witness and asserts they match the claims, so a
/// dishonest claim cannot produce a receipt. The program itself is a witness: it is bound publicly
/// only through `claimed_program_hash`, which the guest both checks and commits.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GuestInput {
    /// The program to run (witness). The guest checks `sha256(program) == claimed_program_hash`.
    pub program: Program,
    /// The public input tape.
    pub public_inputs: Vec<u64>,
    /// The program hash the caller commits to publicly. Must equal `sha256(program)`.
    pub claimed_program_hash: [u8; 32],
    /// The output the caller claims the program produces. Must equal `execute(program, inputs)`.
    pub claimed_output: u64,
}

/// The PUBLIC statement committed to the journal by the guest. A verifying receipt attests exactly
/// this tuple: "program with this hash, run on these public inputs, produced this output".
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Statement {
    /// `sha256(serialize(program))`. Binds WHICH program ran. The guest recomputes this from the
    /// witnessed program and asserts equality, so the program is not free to vary.
    pub program_hash: [u8; 32],
    /// The public input tape the program was run on (committed in full so the verifier sees it).
    pub public_inputs: Vec<u64>,
    /// The single u64 output left on top of the stack at halt (the program's result).
    pub output: u64,
}

/// Why execution failed. These are all guest-panic conditions (no receipt). They are deterministic
/// functions of the program + inputs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VmError {
    /// The input tape length did not match `program.num_inputs`.
    InputArityMismatch { expected: u32, got: usize },
    /// Program exceeded [`MAX_OPS`].
    ProgramTooLong { len: usize },
    /// A `Load(i)` referenced an out-of-range input index.
    InputOutOfRange { index: u32, len: usize },
    /// A register index was `>= NUM_REGS`.
    BadRegister { reg: u8 },
    /// An op needed more operands than were on the stack.
    StackUnderflow { op: &'static str },
    /// The stack would exceed [`MAX_STACK`].
    StackOverflow,
    /// Division or remainder by zero.
    DivByZero { op: &'static str },
    /// The program halted with a stack that was not exactly one value (no single output).
    BadFinalStack { depth: usize },
}

impl core::fmt::Display for VmError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            VmError::InputArityMismatch { expected, got } => {
                write!(f, "input arity mismatch: program expects {expected}, got {got}")
            }
            VmError::ProgramTooLong { len } => write!(f, "program too long: {len} ops (max {MAX_OPS})"),
            VmError::InputOutOfRange { index, len } => {
                write!(f, "Load index {index} out of range (input len {len})")
            }
            VmError::BadRegister { reg } => write!(f, "register {reg} out of range (max {})", NUM_REGS - 1),
            VmError::StackUnderflow { op } => write!(f, "stack underflow on {op}"),
            VmError::StackOverflow => write!(f, "stack overflow (max {MAX_STACK})"),
            VmError::DivByZero { op } => write!(f, "{op} by zero"),
            VmError::BadFinalStack { depth } => {
                write!(f, "program must halt with exactly one output; final stack depth {depth}")
            }
        }
    }
}

/// Canonical serialization of a program for hashing. We use a simple, explicit, deterministic
/// big-endian byte encoding (NOT serde/bincode) so the program hash is stable and reproducible
/// regardless of any serde framing. Layout:
///   [num_inputs: u32 BE] [num_ops: u32 BE] then per op: [tag: u8] [operand bytes...]
pub fn serialize_program(program: &Program) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + program.ops.len() * 2);
    out.extend_from_slice(&program.num_inputs.to_be_bytes());
    out.extend_from_slice(&(program.ops.len() as u32).to_be_bytes());
    for op in &program.ops {
        match op {
            Op::PushConst(v) => {
                out.push(0x01);
                out.extend_from_slice(&v.to_be_bytes());
            }
            Op::Load(i) => {
                out.push(0x02);
                out.extend_from_slice(&i.to_be_bytes());
            }
            Op::Store(r) => {
                out.push(0x03);
                out.push(*r);
            }
            Op::LoadReg(r) => {
                out.push(0x04);
                out.push(*r);
            }
            Op::Dup => out.push(0x05),
            Op::Pop => out.push(0x06),
            Op::Swap => out.push(0x07),
            Op::Add => out.push(0x10),
            Op::Sub => out.push(0x11),
            Op::Mul => out.push(0x12),
            Op::Div => out.push(0x13),
            Op::Rem => out.push(0x14),
            Op::Lt => out.push(0x20),
            Op::Eq => out.push(0x21),
            Op::And => out.push(0x22),
            Op::Or => out.push(0x23),
            Op::Xor => out.push(0x24),
            Op::Hash8 => out.push(0x30),
        }
    }
    out
}

/// `sha256(serialize_program(program))`: the program-binding hash that goes in the [`Statement`].
pub fn program_hash(program: &Program) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(serialize_program(program));
    let mut out = [0u8; 32];
    out.copy_from_slice(&h.finalize());
    out
}

/// Execute `program` over `inputs`, returning the single u64 output (top of stack at halt) or a
/// [`VmError`]. Deterministic and total within [`MAX_OPS`] steps (no loops). This is the heart of
/// the machine; the guest calls [`run_checked`] which wraps this plus the hash/output assertions.
pub fn execute(program: &Program, inputs: &[u64]) -> Result<u64, VmError> {
    if program.ops.len() > MAX_OPS {
        return Err(VmError::ProgramTooLong { len: program.ops.len() });
    }
    if inputs.len() != program.num_inputs as usize {
        return Err(VmError::InputArityMismatch {
            expected: program.num_inputs,
            got: inputs.len(),
        });
    }

    let mut stack: Vec<u64> = Vec::with_capacity(64);
    let mut regs = [0u64; NUM_REGS];

    // Push helper that enforces the stack bound.
    macro_rules! push {
        ($v:expr) => {{
            if stack.len() >= MAX_STACK {
                return Err(VmError::StackOverflow);
            }
            stack.push($v);
        }};
    }
    // Pop helper that names the op in the underflow error.
    macro_rules! pop {
        ($op:expr) => {
            stack.pop().ok_or(VmError::StackUnderflow { op: $op })?
        };
    }

    for op in &program.ops {
        match op {
            Op::PushConst(v) => push!(*v),
            Op::Load(i) => {
                let idx = *i as usize;
                let v = *inputs
                    .get(idx)
                    .ok_or(VmError::InputOutOfRange { index: *i, len: inputs.len() })?;
                push!(v);
            }
            Op::Store(r) => {
                if *r as usize >= NUM_REGS {
                    return Err(VmError::BadRegister { reg: *r });
                }
                let v = pop!("Store");
                regs[*r as usize] = v;
            }
            Op::LoadReg(r) => {
                if *r as usize >= NUM_REGS {
                    return Err(VmError::BadRegister { reg: *r });
                }
                push!(regs[*r as usize]);
            }
            Op::Dup => {
                let v = pop!("Dup");
                push!(v);
                push!(v);
            }
            Op::Pop => {
                let _ = pop!("Pop");
            }
            Op::Swap => {
                let b = pop!("Swap");
                let a = pop!("Swap");
                push!(b);
                push!(a);
            }
            Op::Add => {
                let b = pop!("Add");
                let a = pop!("Add");
                push!(a.wrapping_add(b));
            }
            Op::Sub => {
                let b = pop!("Sub");
                let a = pop!("Sub");
                push!(a.wrapping_sub(b));
            }
            Op::Mul => {
                let b = pop!("Mul");
                let a = pop!("Mul");
                push!(a.wrapping_mul(b));
            }
            Op::Div => {
                let b = pop!("Div");
                let a = pop!("Div");
                if b == 0 {
                    return Err(VmError::DivByZero { op: "Div" });
                }
                push!(a / b);
            }
            Op::Rem => {
                let b = pop!("Rem");
                let a = pop!("Rem");
                if b == 0 {
                    return Err(VmError::DivByZero { op: "Rem" });
                }
                push!(a % b);
            }
            Op::Lt => {
                let b = pop!("Lt");
                let a = pop!("Lt");
                push!(if a < b { 1 } else { 0 });
            }
            Op::Eq => {
                let b = pop!("Eq");
                let a = pop!("Eq");
                push!(if a == b { 1 } else { 0 });
            }
            Op::And => {
                let b = pop!("And");
                let a = pop!("And");
                push!(a & b);
            }
            Op::Or => {
                let b = pop!("Or");
                let a = pop!("Or");
                push!(a | b);
            }
            Op::Xor => {
                let b = pop!("Xor");
                let a = pop!("Xor");
                push!(a ^ b);
            }
            Op::Hash8 => {
                // Pop 8 entries; the FIRST popped is the most-recently-pushed. We hash them in
                // pop order (top first) so the encoding is fully determined by the stack contents.
                let mut bytes = [0u8; 8];
                for slot in bytes.iter_mut() {
                    *slot = (pop!("Hash8") & 0xFF) as u8;
                }
                let mut h = Sha256::new();
                h.update(bytes);
                let digest = h.finalize();
                let mut first8 = [0u8; 8];
                first8.copy_from_slice(&digest[..8]);
                push!(u64::from_be_bytes(first8));
            }
        }
    }

    if stack.len() != 1 {
        return Err(VmError::BadFinalStack { depth: stack.len() });
    }
    Ok(stack[0])
}

/// The full guest-side check, as a pure function so the host and the unit tests exercise the exact
/// same logic the guest runs. Given a witnessed `program`, the public `inputs`, the public
/// `claimed_program_hash`, and the public `claimed_output`:
///   1. assert `sha256(program) == claimed_program_hash` (binds WHICH program),
///   2. `execute(program, inputs)` (any trap is an Err -> guest panic -> no receipt),
///   3. assert the computed output `== claimed_output`,
/// and return the [`Statement`] to commit. Any failed check is an Err and the guest turns it into
/// a panic, so a receipt can only exist for a true statement.
pub fn run_checked(
    program: &Program,
    inputs: &[u64],
    claimed_program_hash: &[u8; 32],
    claimed_output: u64,
) -> Result<Statement, String> {
    let actual_hash = program_hash(program);
    if &actual_hash != claimed_program_hash {
        return Err(format!(
            "program hash mismatch: claimed {} but witnessed program hashes to {}",
            hex32(claimed_program_hash),
            hex32(&actual_hash)
        ));
    }
    let output = execute(program, inputs).map_err(|e| format!("execution trapped: {e}"))?;
    if output != claimed_output {
        return Err(format!(
            "output mismatch: program produced {output} but caller claimed {claimed_output}"
        ));
    }
    Ok(Statement {
        program_hash: actual_hash,
        public_inputs: inputs.to_vec(),
        output,
    })
}

/// Lowercase hex of a 32-byte digest (used in error messages and by the host/CLI).
pub fn hex32(b: &[u8; 32]) -> String {
    let mut s = String::with_capacity(64);
    for byte in b {
        s.push_str(&format!("{byte:02x}"));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: build a program and run it end to end with the honest claimed hash + claimed output.
    fn run_ok(program: Program, inputs: &[u64], expected: u64) -> Statement {
        let h = program_hash(&program);
        let stmt = run_checked(&program, inputs, &h, expected).expect("should run");
        assert_eq!(stmt.output, expected);
        assert_eq!(stmt.program_hash, h);
        assert_eq!(stmt.public_inputs, inputs.to_vec());
        stmt
    }

    #[test]
    fn arithmetic_quadratic() {
        // f(x, y) = x*x + 3*y over inputs [5, 7] = 25 + 21 = 46.
        let program = Program {
            num_inputs: 2,
            ops: vec![
                Op::Load(0),
                Op::Dup,
                Op::Mul, // x*x
                Op::PushConst(3),
                Op::Load(1),
                Op::Mul, // 3*y
                Op::Add, // x*x + 3*y
            ],
        };
        run_ok(program, &[5, 7], 46);
    }

    #[test]
    fn comparison_predicate() {
        // predicate: is input[0] < input[1]? -> 1 for (3, 9), 0 for (9, 3).
        let program = Program {
            num_inputs: 2,
            ops: vec![Op::Load(0), Op::Load(1), Op::Lt],
        };
        run_ok(program.clone(), &[3, 9], 1);
        run_ok(program, &[9, 3], 0);
    }

    #[test]
    fn registers_dot_product() {
        // dot product of two length-3 vectors via registers: sum_i a_i*b_i.
        // inputs: [a0,a1,a2, b0,b1,b2]. accumulator in reg 0.
        let mut ops = vec![Op::PushConst(0), Op::Store(0)];
        for i in 0..3u32 {
            ops.push(Op::Load(i)); // a_i
            ops.push(Op::Load(i + 3)); // b_i
            ops.push(Op::Mul);
            ops.push(Op::LoadReg(0));
            ops.push(Op::Add);
            ops.push(Op::Store(0));
        }
        ops.push(Op::LoadReg(0));
        let program = Program { num_inputs: 6, ops };
        // [1,2,3] . [4,5,6] = 4 + 10 + 18 = 32
        run_ok(program, &[1, 2, 3, 4, 5, 6], 32);
    }

    #[test]
    fn hash_chain() {
        // Build the SAME hash the ISA computes for 8 input bytes, then assert run_checked agrees.
        let program = Program {
            num_inputs: 8,
            ops: vec![
                Op::Load(0),
                Op::Load(1),
                Op::Load(2),
                Op::Load(3),
                Op::Load(4),
                Op::Load(5),
                Op::Load(6),
                Op::Load(7),
                Op::Hash8,
            ],
        };
        let inputs = [1u64, 2, 3, 4, 5, 6, 7, 8];
        // Reference: Hash8 pops top-first, so bytes = [in7,in6,in5,in4,in3,in2,in1,in0] low byte.
        let bytes: [u8; 8] = [8, 7, 6, 5, 4, 3, 2, 1];
        let mut h = Sha256::new();
        h.update(bytes);
        let d = h.finalize();
        let mut first8 = [0u8; 8];
        first8.copy_from_slice(&d[..8]);
        let expected = u64::from_be_bytes(first8);
        run_ok(program, &inputs, expected);
    }

    #[test]
    fn wrong_output_is_rejected() {
        let program = Program {
            num_inputs: 1,
            ops: vec![Op::Load(0), Op::PushConst(1), Op::Add],
        };
        let h = program_hash(&program);
        // f(41) = 42; claim 99 -> must error (this is the guest panic condition).
        let err = run_checked(&program, &[41], &h, 99).unwrap_err();
        assert!(err.contains("output mismatch"), "got: {err}");
    }

    #[test]
    fn wrong_program_hash_is_rejected() {
        let program = Program {
            num_inputs: 1,
            ops: vec![Op::Load(0)],
        };
        let real_output = execute(&program, &[7]).unwrap();
        // Claim a hash for a DIFFERENT program; run_checked must reject even though output matches.
        let other = Program {
            num_inputs: 1,
            ops: vec![Op::Load(0), Op::PushConst(0), Op::Add],
        };
        let wrong_hash = program_hash(&other);
        let err = run_checked(&program, &[7], &wrong_hash, real_output).unwrap_err();
        assert!(err.contains("program hash mismatch"), "got: {err}");
    }

    #[test]
    fn div_by_zero_traps() {
        let program = Program {
            num_inputs: 2,
            ops: vec![Op::Load(0), Op::Load(1), Op::Div],
        };
        assert_eq!(execute(&program, &[10, 0]), Err(VmError::DivByZero { op: "Div" }));
    }

    #[test]
    fn underflow_traps() {
        let program = Program {
            num_inputs: 0,
            ops: vec![Op::Add],
        };
        assert_eq!(execute(&program, &[]), Err(VmError::StackUnderflow { op: "Add" }));
    }

    #[test]
    fn input_arity_enforced() {
        let program = Program {
            num_inputs: 2,
            ops: vec![Op::Load(0), Op::Load(1), Op::Add],
        };
        assert!(matches!(
            execute(&program, &[1]),
            Err(VmError::InputArityMismatch { expected: 2, got: 1 })
        ));
    }

    #[test]
    fn final_stack_must_be_one() {
        // leaves two values -> BadFinalStack
        let program = Program {
            num_inputs: 0,
            ops: vec![Op::PushConst(1), Op::PushConst(2)],
        };
        assert_eq!(execute(&program, &[]), Err(VmError::BadFinalStack { depth: 2 }));
    }

    #[test]
    fn program_hash_is_stable_and_distinct() {
        let a = Program { num_inputs: 1, ops: vec![Op::Load(0)] };
        let b = Program { num_inputs: 1, ops: vec![Op::Load(0), Op::Pop, Op::Load(0)] };
        assert_eq!(program_hash(&a), program_hash(&a));
        assert_ne!(program_hash(&a), program_hash(&b));
    }
}
