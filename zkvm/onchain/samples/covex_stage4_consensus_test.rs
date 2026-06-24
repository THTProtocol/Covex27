// ── COVEX STAGE 4: full ZkGameSettle settlement under the node's OWN consensus verifier ──────────
//
// Appended to crypto/txscript/src/lib.rs on the Hetzner TN12 box for a single run, then reverted
// (the rusty-kaspa tree must stay clean). This is the DECISIVE Docker-and-liveness-independent proof
// that the Kaspa KIP-16 OpZkPrecompile (0xa6, tag 0x20) consensus path ACCEPTS a REAL Covex game
// Groth16 seal inside the full ZkGameSettle winner-branch P2SH spend (proof verifies on-chain AND the
// winner's Schnorr signature checks), and REJECTS a forged proof, a wrong signature, and a premature
// CSV refund. It runs the exact `TxScriptEngine::from_transaction_input` the node uses to validate a
// submitted transaction's input scripts, with `covenants_enabled = true` (live on TN12 from genesis).
//
// The VK + the 5 BN254 Fr public inputs + the real proof are loaded from the real game receipt sample
// (/tmp/covex_sample/, produced by `prove_with_opts(ProverOpts::groth16())` on a real decisive chess
// win). The winner pubkey baked in the redeem is a real x-only secp256k1 key we sign with.
#[cfg(test)]
mod covex_stage4_consensus {
    use crate::caches::Cache;
    use crate::opcodes::codes::{
        OpCheckSequenceVerify, OpCheckSig, OpData1, OpDrop, OpElse, OpEndIf, OpFalse, OpFromAltStack,
        OpIf, OpToAltStack, OpTrue, OpZkPrecompile,
    };
    use crate::script_builder::ScriptBuilder;
    use crate::{pay_to_script_hash_script, EngineFlags, TxScriptEngine, UtxoEntry};
    use crate::{EngineCtx};
    use kaspa_consensus_core::hashing::sighash::{calc_schnorr_signature_hash, SigHashReusedValuesUnsync};
    use kaspa_consensus_core::hashing::sighash_type::SIG_HASH_ALL;
    use kaspa_consensus_core::mass::SigopCount;
    use kaspa_consensus_core::tx::{
        MutableTransaction, ScriptPublicKey, Transaction, TransactionId, TransactionInput,
        TransactionOutpoint, TransactionOutput, VerifiableTransaction,
    };

    const ZK_TAG_GROTH16: u8 = 0x20;

    fn rd(p: &str) -> Vec<u8> {
        hex::decode(std::fs::read_to_string(p).unwrap().trim()).unwrap()
    }
    fn rd_inputs(p: &str) -> Vec<[u8; 32]> {
        std::fs::read_to_string(p)
            .unwrap()
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| {
                let b = hex::decode(l.trim()).unwrap();
                let mut a = [0u8; 32];
                a.copy_from_slice(&b);
                a
            })
            .collect()
    }

    /// The exact ZkGameSettle winner-branch redeem the Covex backend builds (redeem_zk_game_settle):
    /// OP_IF OpToAltStack <in4..in0> <n=5> OpFromAltStack <vk> OpData1 0x20 0xa6 OpDrop <winner> OpCheckSig
    /// OP_ELSE <min_seq> OpCheckSequenceVerify <refund> OpCheckSig OP_ENDIF
    fn redeem_zk_game_settle(
        vk: &[u8],
        inputs: &[[u8; 32]],
        winner: &[u8; 32],
        min_seq: u64,
        refund: &[u8; 32],
    ) -> Vec<u8> {
        let mut b = ScriptBuilder::new();
        b.add_op(OpIf).unwrap();
        b.add_op(OpToAltStack).unwrap();
        for fr in inputs.iter().rev() {
            b.add_data(fr).unwrap();
        }
        // n=5 as an OpData1 push of one byte (matches push_data1 in the backend).
        b.add_data(&[inputs.len() as u8]).unwrap();
        b.add_op(OpFromAltStack).unwrap();
        b.add_data(vk).unwrap();
        b.add_data(&[ZK_TAG_GROTH16]).unwrap();
        b.add_op(OpZkPrecompile).unwrap();
        b.add_op(OpDrop).unwrap();
        b.add_data(winner).unwrap();
        b.add_op(OpCheckSig).unwrap();
        b.add_op(OpElse).unwrap();
        b.add_lock_time(min_seq).unwrap();
        b.add_op(OpCheckSequenceVerify).unwrap();
        b.add_data(refund).unwrap();
        b.add_op(OpCheckSig).unwrap();
        b.add_op(OpEndIf).unwrap();
        b.drain()
    }

    /// Build a spend tx for the winner branch, compute the real schnorr sighash, sign it with `kp`,
    /// assemble the witness [sig+SIG_HASH_ALL, proof, OP_TRUE] || redeem, run the CONSENSUS engine.
    /// `sequence` is the spending input's sequence (BIP68 relative lock); 0 for the winner branch.
    fn run_winner(
        redeem: &[u8],
        proof: &[u8],
        kp: &secp256k1::Keypair,
        select_if: bool,    // true -> OP_TRUE (winner branch), false -> OP_FALSE (refund branch)
        sequence: u64,
    ) -> Result<(), crate::TxScriptError> {
        let spk = pay_to_script_hash_script(redeem);
        let stake = 100_000_000u64;
        let utxo = UtxoEntry::new(stake, spk.clone(), 0, false, None);
        let input = TransactionInput {
            previous_outpoint: TransactionOutpoint { transaction_id: TransactionId::default(), index: 0 },
            signature_script: vec![],
            sequence,
            // The winner branch runs OpZkPrecompile (1 sigop in the template) + OpCheckSig (1); allow
            // a generous sigop budget so the meter does not cap the run (script-units carry the real
            // precompile cost under covenants_enabled, and from_transaction_input uses u64::MAX units).
            mass: SigopCount(10).into(),
        };
        let output = TransactionOutput { value: stake - 1_000_000, script_public_key: ScriptPublicKey::new(0, vec![OpTrue].into()), covenant: None };
        let tx = Transaction::new(1, vec![input], vec![output], 0, Default::default(), 0, vec![]);
        let mut mtx = MutableTransaction::with_entries(tx, vec![utxo.clone()]);

        let reused = SigHashReusedValuesUnsync::new();
        let sig_hash = calc_schnorr_signature_hash(&mtx.as_verifiable(), 0, SIG_HASH_ALL, &reused);
        let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice()).unwrap();
        let sig: [u8; 64] = *kp.sign_schnorr(msg).as_ref();
        let sig_with_type: Vec<u8> = sig.into_iter().chain([SIG_HASH_ALL.to_u8()]).collect();

        // Witness (bottom -> top): sig, proof, OP_TRUE/FALSE selector ; then the P2SH redeem push.
        let mut wb = ScriptBuilder::new();
        wb.add_data(&sig_with_type).unwrap();
        if select_if {
            wb.add_data(proof).unwrap();
            wb.add_op(OpTrue).unwrap();
        } else {
            wb.add_op(OpFalse).unwrap();
        }
        wb.add_data(redeem).unwrap();
        mtx.tx.inputs[0].signature_script = wb.drain();

        let sig_cache = Cache::new(10_000);
        let reused2 = SigHashReusedValuesUnsync::new();
        let vtx = mtx.as_verifiable();
        let mut vm = TxScriptEngine::from_transaction_input(
            &vtx,
            &vtx.inputs()[0],
            0,
            vtx.utxo(0).unwrap(),
            EngineCtx::new(&sig_cache).with_reused(&reused2),
            EngineFlags { covenants_enabled: true, ..Default::default() },
        );
        vm.execute()
    }

    #[test]
    fn covex_stage4_real_seal_full_settlement_accept_and_reject() {
        let dir = "/tmp/covex_sample";
        let vk = rd(&format!("{dir}/vk.hex"));
        let proof = rd(&format!("{dir}/proof.hex"));
        let inputs = rd_inputs(&format!("{dir}/public_inputs.hex"));
        assert_eq!(inputs.len(), 5, "real sample must have 5 Fr public inputs");

        let secp = secp256k1::Secp256k1::new();
        // Winner keypair: a real x-only secp key baked as the covenant payee.
        let winner_kp = secp256k1::Keypair::from_seckey_slice(&secp, &[0x11u8; 32]).unwrap();
        let winner_xonly: [u8; 32] = winner_kp.x_only_public_key().0.serialize();
        // A different (wrong) keypair for the negative signature test.
        let wrong_kp = secp256k1::Keypair::from_seckey_slice(&secp, &[0x22u8; 32]).unwrap();
        // Refund keypair (CSV branch).
        let refund_kp = secp256k1::Keypair::from_seckey_slice(&secp, &[0x33u8; 32]).unwrap();
        let refund_xonly: [u8; 32] = refund_kp.x_only_public_key().0.serialize();

        let min_seq = 720u64;
        let redeem = redeem_zk_game_settle(&vk, &inputs, &winner_xonly, min_seq, &refund_xonly);

        // (1) ACCEPT: real seal + correct winner signature -> consensus Ok.
        let ok = run_winner(&redeem, &proof, &winner_kp, true, 0);
        println!("STAGE4 (1) ACCEPT real-seal+winner-sig: {ok:?}");
        ok.expect("real game Groth16 seal + winner sig MUST be accepted by consensus");

        // (2) REJECT forged proof (flip one byte) + correct winner signature -> consensus Err.
        let mut forged = proof.clone();
        forged[0] ^= 0x01;
        let bad = run_winner(&redeem, &forged, &winner_kp, true, 0);
        println!("STAGE4 (2) REJECT forged-proof: {bad:?}");
        assert!(bad.is_err(), "a forged proof MUST be rejected by consensus, got {bad:?}");

        // (3) REJECT wrong signature (sign with the wrong key) + real proof -> consensus Err.
        let bad_sig = run_winner(&redeem, &proof, &wrong_kp, true, 0);
        println!("STAGE4 (3) REJECT wrong-sig: {bad_sig:?}");
        assert!(bad_sig.is_err(), "a wrong winner signature MUST be rejected, got {bad_sig:?}");

        // (4) REJECT premature CSV refund: take the ELSE branch with a spending sequence (0) below
        //     min_seq (720) -> OpCheckSequenceVerify fails -> consensus Err. Signed by the refund key.
        let premature = run_winner(&redeem, &proof, &refund_kp, false, 0);
        println!("STAGE4 (4) REJECT premature-CSV-refund: {premature:?}");
        assert!(premature.is_err(), "a premature CSV refund MUST be rejected, got {premature:?}");

        // (5) REJECT wrong-binding (cross-pot replay defense): bake a redeem whose claim-digest input
        //     c0 (public_inputs[2], which folds covenant_id + winner via the RISC0 claim) is perturbed
        //     by one field element. This is a STRUCTURALLY VALID proof + valid points, but the Groth16
        //     RELATION no longer holds for the tampered public input -> consensus rejects at the verify
        //     (not at deserialization). Proves a real proof cannot settle a DIFFERENT pot/binding.
        let mut wrong_inputs = inputs.clone();
        wrong_inputs[2][0] ^= 0x01; // perturb c0 (claim-digest low half) by one bit.
        let wrong_bind_redeem =
            redeem_zk_game_settle(&vk, &wrong_inputs, &winner_xonly, min_seq, &refund_xonly);
        let wrong_bind = run_winner(&wrong_bind_redeem, &proof, &winner_kp, true, 0);
        println!("STAGE4 (5) REJECT wrong-binding (perturbed claim-digest input): {wrong_bind:?}");
        assert!(
            wrong_bind.is_err(),
            "the real proof MUST NOT verify against a tampered claim-digest binding, got {wrong_bind:?}"
        );

        println!("COVEX STAGE4 CONSENSUS GATE PASSED: real seal accepts; forged-proof, wrong-sig, premature-CSV, and wrong-binding all reject.");
    }
}
