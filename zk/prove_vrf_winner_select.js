#!/usr/bin/env node
"use strict";
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const { hash } = require("./lib/poseidon_hash");

const WASM = path.join(__dirname, "vrf_winner_select_js/vrf_winner_select.wasm");
const ZKEY = path.join(__dirname, "vrf_winner_select.zkey");
const OUT = path.join(__dirname, "vrf_winner_select_proof.json");

async function main() {
    const secret = BigInt(process.argv[2] || "777777");
    const seed = BigInt(process.argv[3] || "98765432109876543");
    const numEntrants = BigInt(process.argv[4] || "100");
    const covenantId = BigInt(process.argv[5] || "1");

    if (numEntrants < 1n) throw new Error("numEntrants must be >= 1");
    if (numEntrants >= (1n << 32n)) throw new Error("numEntrants must be < 2^32 (v1 cap)");

    const RBITS = 64n;
    const TWO_RBITS = 1n << RBITS;

    // True VRF output, split into the low 64-bit randomness word r and the high part hi,
    // then reduce r mod numEntrants. This mirrors the in-circuit reduction exactly.
    const computed = BigInt(await hash([secret.toString(), seed.toString()]));
    const hi = computed / TWO_RBITS;             // floor(computed / 2^64)
    const r = computed % TWO_RBITS;              // low 64 bits = computed mod 2^64
    const winner = r % numEntrants;              // in [0, numEntrants)
    const q2 = (r - winner) / numEntrants;       // exact integer quotient of r div numEntrants

    const input = {
        secret: secret.toString(),
        seed: seed.toString(),
        numEntrants: numEntrants.toString(),
        winner: winner.toString(),
        hi: hi.toString(),
        q2: q2.toString(),
        covenantId: covenantId.toString(),
    };

    const wtns = path.join(__dirname, ".wtns.vrfwin.tmp");
    await snarkjs.wtns.calculate(input, WASM, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, wtns);
    fs.writeFileSync(OUT, JSON.stringify({ proof, publicSignals }, null, 2));
    console.log("Proof:", OUT);
    console.log("winner=", winner.toString(), "of numEntrants=", numEntrants.toString());
    console.log("publicSignals=", JSON.stringify(publicSignals));
    try { fs.unlinkSync(wtns); } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
