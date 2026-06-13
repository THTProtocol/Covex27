//! covenant_builder.rs - real Kaspa pay-to-script-hash (P2SH) covenant construction.
//! (Roadmap B3: the custody primitive every real covenant builds on.)
//!
//! Until now every Covex "deploy" was a self-payment whose only covenant content
//! was an inert `aa20` metadata payload - nothing ever locked to a script, and the
//! funded output paid straight back to the deployer (signer.rs Output 0 ==
//! deployer_script). This module builds REAL P2SH covenants: funds lock to
//! blake2b256(redeem_script) and can only be moved by satisfying the redeem script.
//! The locking script `pay_to_script_hash_script` emits is exactly the
//! `aa20 <32-byte hash> 87` pattern the crawler/classifier already recognizes as P2SH.
//!
//! ## Signing a P2SH spend (the subtle part, verified against the txscript engine)
//! Kaspa's `calc_schnorr_signature_hash(tx, input_idx, ...)` commits to the spent
//! UTXO's `script_public_key` - which for a P2SH output is the P2SH WRAPPER, not the
//! redeem script. The txscript engine's `check_schnorr_signature` recomputes the same
//! hash the same way. So a P2SH spend is signed exactly like an ordinary input whose
//! `UtxoEntry.script_public_key` is the P2SH wrapper; the satisfier
//! (`OpData65 <sig||sighashtype>` then any extra pushes such as a hashlock preimage)
//! is concatenated with a push of the redeem script via
//! `pay_to_script_hash_signature_script`. The unit tests below run the real
//! `TxScriptEngine` to prove a correct spend passes and a wrong one fails - the
//! consensus-correctness gate before any value is ever locked on-chain.

use kaspa_addresses::{Address, Prefix};
use kaspa_consensus_core::hashing::sighash::{calc_schnorr_signature_hash, SigHashReusedValues};
use kaspa_consensus_core::hashing::sighash_type::SIG_HASH_ALL;
use kaspa_consensus_core::tx::{ScriptPublicKey, SignableTransaction, VerifiableTransaction};
use kaspa_txscript::opcodes::codes::{OpBlake2b, OpCheckSig, OpEqualVerify};
use kaspa_txscript::script_builder::ScriptBuilder;

pub type BResult<T> = Result<T, String>;

/// The covenant kinds this builder can lock funds into. Each maps to a redeem
/// script that is genuinely enforced by Kaspa consensus (no oracle, no silverc).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RedeemKind {
    /// `<xonly_pubkey> OpCheckSig` - spendable only by the holder of the key.
    /// The minimal real P2SH (proves the lock/spend pipeline end to end).
    SingleSig { xonly_pubkey: [u8; 32] },
    /// `OpBlake2b <hash> OpEqualVerify <xonly_pubkey> OpCheckSig` - conditional
    /// release: spend requires revealing a preimage P with blake2b256(P)==hash
    /// AND a valid signature. The building block for HTLC / commit-reveal escrow.
    HashLock { hash: [u8; 32], xonly_pubkey: [u8; 32] },
}

impl RedeemKind {
    /// Serialize this kind into its Kaspa redeem script bytes.
    pub fn redeem_script(&self) -> BResult<Vec<u8>> {
        match self {
            RedeemKind::SingleSig { xonly_pubkey } => redeem_singlesig(xonly_pubkey),
            RedeemKind::HashLock { hash, xonly_pubkey } => redeem_hashlock(hash, xonly_pubkey),
        }
    }
}

/// Redeem script for a single-signature P2SH covenant: `<xonly_pubkey> OpCheckSig`.
pub fn redeem_singlesig(xonly_pubkey: &[u8; 32]) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_data(xonly_pubkey).map_err(|e| format!("redeem singlesig add_data: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("redeem singlesig add_op: {e}"))?;
    Ok(b.drain())
}

/// Redeem script for a hashlock covenant:
/// `OpBlake2b <hash32> OpEqualVerify <xonly_pubkey> OpCheckSig`.
/// To spend, the satisfier must push the signature then the preimage (preimage on
/// top, so OpBlake2b consumes it first), then the redeem script.
pub fn redeem_hashlock(hash32: &[u8; 32], xonly_pubkey: &[u8; 32]) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_op(OpBlake2b).map_err(|e| format!("redeem hashlock OpBlake2b: {e}"))?;
    b.add_data(hash32).map_err(|e| format!("redeem hashlock hash: {e}"))?;
    b.add_op(OpEqualVerify).map_err(|e| format!("redeem hashlock OpEqualVerify: {e}"))?;
    b.add_data(xonly_pubkey).map_err(|e| format!("redeem hashlock pubkey: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("redeem hashlock OpCheckSig: {e}"))?;
    Ok(b.drain())
}

/// blake2b-256 of a preimage, matching the hash OpBlake2b computes on-chain. Used
/// to build a hashlock's `hash` from a chosen secret.
pub fn blake2b256(data: &[u8]) -> [u8; 32] {
    let digest = blake2b_simd::Params::new().hash_length(32).to_state().update(data).finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(digest.as_bytes());
    out
}

/// The P2SH locking ScriptPublicKey for a redeem script. This is what a deploy's
/// Output 0 funds (the stake is now genuinely locked to the script, not self-paid).
pub fn p2sh_script_pubkey(redeem: &[u8]) -> ScriptPublicKey {
    kaspa_txscript::pay_to_script_hash_script(redeem)
}

/// The kaspa P2SH address (`kaspa:` / `kaspatest:` ...) for a redeem script.
pub fn p2sh_address(redeem: &[u8], prefix: Prefix) -> BResult<Address> {
    kaspa_txscript::extract_script_pub_key_address(&p2sh_script_pubkey(redeem), prefix)
        .map_err(|e| format!("p2sh address: {e}"))
}

/// Network string -> address prefix.
pub fn prefix_for_network(network: &str) -> Prefix {
    if network == "mainnet" || network == "mainnet-1" {
        Prefix::Mainnet
    } else {
        Prefix::Testnet
    }
}

/// Build the input `idx` signature_script that spends a P2SH output.
///
/// `signable` must already have `entries[idx].script_public_key` set to the P2SH
/// wrapper (the on-chain script of the UTXO being spent) and all signature_scripts
/// empty (the sighash excludes them). `extra_after_sig` are pushed (via add_data)
/// after the signature, in stack order (last item ends up on top) - e.g. the
/// preimage for a hashlock. Returns the bytes to assign to
/// `tx.inputs[idx].signature_script`.
pub fn build_p2sh_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    keypair: &secp256k1::Keypair,
    redeem: &[u8],
    extra_after_sig: &[Vec<u8>],
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let sig: [u8; 64] = *keypair.sign_schnorr(msg).as_ref();
    // OpData65 (== 65) pushes the 65-byte (64 sig + 1 sighashtype) signature value.
    let mut satisfier: Vec<u8> = std::iter::once(65u8).chain(sig).chain([SIG_HASH_ALL.to_u8()]).collect();
    for extra in extra_after_sig {
        let mut b = ScriptBuilder::new();
        b.add_data(extra).map_err(|e| format!("satisfier extra push: {e}"))?;
        satisfier.extend_from_slice(&b.drain());
    }
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("p2sh signature script: {e}"))
}

/// Derive the x-only public key (32 bytes) from a 32-byte secp256k1 secret key.
pub fn xonly_from_seckey(seckey: &[u8; 32]) -> BResult<[u8; 32]> {
    let kp = secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, seckey)
        .map_err(|e| format!("bad seckey: {e}"))?;
    Ok(kp.x_only_public_key().0.serialize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use kaspa_consensus_core::subnets::SubnetworkId;
    use kaspa_consensus_core::tx::{
        Transaction, TransactionInput, TransactionOutpoint, TransactionOutput, UtxoEntry,
    };
    use kaspa_txscript::{caches::Cache, TxScriptEngine};
    use secp256k1::Keypair;

    fn test_keypair(seed: u8) -> Keypair {
        let sk = [seed.max(1); 32];
        Keypair::from_seckey_slice(secp256k1::SECP256K1, &sk).unwrap()
    }

    /// Build a spend tx of a single P2SH UTXO, install the signature_script, and run
    /// the real consensus engine. Returns whether `execute()` succeeded.
    fn run_spend(redeem: &[u8], sign_kp: &Keypair, extra_after_sig: &[Vec<u8>]) -> bool {
        let prev = TransactionOutpoint {
            transaction_id: kaspa_hashes::Hash::from_bytes([7u8; 32]),
            index: 0,
        };
        let tx = Transaction::new(
            0,
            vec![TransactionInput { previous_outpoint: prev, signature_script: vec![], sequence: 0, sig_op_count: 1 }],
            vec![TransactionOutput { value: 90_000_000, script_public_key: p2sh_script_pubkey(redeem) }],
            0,
            SubnetworkId::from_bytes([0u8; 20]),
            0,
            vec![],
        );
        let entries = vec![UtxoEntry {
            amount: 100_000_000,
            script_public_key: p2sh_script_pubkey(redeem),
            block_daa_score: 1,
            is_coinbase: false,
        }];
        let mut signable = SignableTransaction::with_entries(tx, entries);
        let sig_script = build_p2sh_signature_script(&signable, 0, sign_kp, redeem, extra_after_sig).unwrap();
        signable.tx.inputs[0].signature_script = sig_script;

        let verifiable = signable.as_verifiable();
        let (input, entry) = verifiable.populated_inputs().next().unwrap();
        let mut reused = SigHashReusedValues::new();
        let cache = Cache::new(10_000);
        let mut engine =
            TxScriptEngine::from_transaction_input(&verifiable, input, 0, entry, &mut reused, &cache).unwrap();
        engine.execute().is_ok()
    }

    #[test]
    fn singlesig_p2sh_spend_valid_and_invalid() {
        let kp = test_keypair(11);
        let xonly = kp.x_only_public_key().0.serialize();
        let redeem = redeem_singlesig(&xonly).unwrap();

        // Correct key spends.
        assert!(run_spend(&redeem, &kp, &[]), "correct single-sig spend must satisfy the P2SH lock");

        // Wrong key is rejected by the engine.
        let wrong = test_keypair(99);
        assert!(!run_spend(&redeem, &wrong, &[]), "wrong-key single-sig spend must be rejected");
    }

    #[test]
    fn hashlock_p2sh_spend_requires_preimage_and_sig() {
        let kp = test_keypair(22);
        let xonly = kp.x_only_public_key().0.serialize();
        let preimage = b"covex-secret-preimage-v1".to_vec();
        let hash = blake2b256(&preimage);
        let redeem = redeem_hashlock(&hash, &xonly).unwrap();

        // Correct preimage + correct key spends.
        assert!(run_spend(&redeem, &kp, &[preimage.clone()]), "correct hashlock spend must satisfy the lock");

        // Wrong preimage is rejected (OpEqualVerify fails).
        assert!(!run_spend(&redeem, &kp, &[b"wrong-preimage".to_vec()]), "wrong preimage must be rejected");

        // Correct preimage but wrong key is rejected (OpCheckSig fails).
        let wrong = test_keypair(98);
        assert!(!run_spend(&redeem, &wrong, &[preimage]), "wrong key must be rejected even with correct preimage");
    }

    #[test]
    fn p2sh_script_pubkey_is_aa20_pattern() {
        // The crawler/classifier recognizes P2SH as aa20 <32 bytes> 87.
        let kp = test_keypair(33);
        let redeem = redeem_singlesig(&kp.x_only_public_key().0.serialize()).unwrap();
        let spk = p2sh_script_pubkey(&redeem);
        let script = spk.script();
        assert_eq!(script.len(), 35, "P2SH script is 1 + 32 + 1 bytes");
        assert_eq!(script[0], 0xaa, "leading OpBlake2b opcode");
        assert_eq!(script[1], 0x20, "32-byte push");
        assert_eq!(script[34], 0x87, "trailing OpEqual");
    }

    #[test]
    fn p2sh_address_round_trips() {
        let kp = test_keypair(44);
        let redeem = redeem_singlesig(&kp.x_only_public_key().0.serialize()).unwrap();
        let addr = p2sh_address(&redeem, Prefix::Testnet).unwrap();
        assert!(addr.to_string().starts_with("kaspatest:"), "testnet P2SH address prefix");
    }
}
