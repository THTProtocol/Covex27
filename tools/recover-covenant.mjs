#!/usr/bin/env node
/*
 * Trustless covenant recovery for Covex enforced (P2SH) covenants.
 *
 * THE ACID TEST: if hightable.pro and the Covex database vanish, can you still
 * recover the redeem script and spend your locked funds with ONLY your wallet and
 * the public Kaspa chain? This tool proves "yes". It does NOT talk to any Covex
 * server - it reads the covenant's own deploy transaction off a public Kaspa node /
 * indexer and reconstructs the redeem script that the on-chain P2SH commits to.
 *
 * On-chain deploy payload format (see backend/src/covenant_builder.rs):
 *   payload[0..2]   = 0xaa 0x20            P2SH discovery marker (OpBlake2b push-32)
 *   payload[2..34]  = blake2b256(redeem)   the 32-byte hash the P2SH locks to
 *   payload[34..]   = redeem script        the FULL script (embedded for recovery)
 *
 * The redeem script is NOT a secret: it is required to spend and is safe to publish.
 * Recovery = take payload[34..], verify blake2b256 of it equals payload[2..34], and
 * you now hold the exact script needed to build + sign a spend with your own wallet.
 *
 * Usage:
 *   # If you already have the deploy tx payload hex (most trustless - no network):
 *   node recover-covenant.mjs --payload <payload_hex>
 *
 *   # Or fetch it yourself from any Kaspa REST indexer you trust (you supply the URL,
 *   # so there is no hard-coded dependency on any one provider):
 *   node recover-covenant.mjs --txid <deploy_tx_id> --api https://api.kaspa.org
 *   node recover-covenant.mjs --txid <deploy_tx_id> --api https://api-tn10.kaspa.org
 *
 * Requires Node 18+ (global fetch) and: npm i @noble/hashes
 * (@noble/hashes' blake2b matches Kaspa's OpBlake2b: 32-byte output, no key.)
 */

import { blake2b } from "@noble/hashes/blake2b";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--payload") out.payload = argv[++i];
    else if (a === "--txid") out.txid = argv[++i];
    else if (a === "--api") out.api = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function toHex(u8) {
  return Buffer.from(u8).toString("hex");
}

/** Extract + verify the redeem script from a deploy-tx payload hex. */
function recoverFromPayload(payloadHex) {
  const buf = Buffer.from(String(payloadHex).replace(/^0x/, ""), "hex");
  if (buf.length < 34 || buf[0] !== 0xaa || buf[1] !== 0x20) {
    throw new Error(
      "not a Covex P2SH deploy payload (expected a 0xaa 0x20 prefix followed by a 32-byte hash)"
    );
  }
  const hash = buf.subarray(2, 34);
  const redeem = buf.subarray(34);
  if (redeem.length === 0) {
    throw new Error(
      "this covenant's payload carries only the hash, not the embedded redeem script. " +
        "It predates the on-chain redeem embed; recover the redeem from the covenant page " +
        "(GET /api/covenants/<txid>:0 returns redeem_script_hex) or your saved deploy response."
    );
  }
  const computed = blake2b(redeem, { dkLen: 32 });
  const valid = Buffer.compare(Buffer.from(computed), hash) === 0;
  return {
    committed_hash: toHex(hash),
    recomputed_hash: toHex(computed),
    redeem_script_hex: toHex(redeem),
    // The on-chain P2SH scriptPublicKey is OpBlake2b <hash> OpEqual = aa20<hash>87.
    p2sh_script_pubkey_hex: "aa20" + toHex(hash) + "87",
    valid,
  };
}

/** Pull the deploy tx payload from a user-chosen Kaspa REST indexer. */
async function fetchPayload(txid, apiBase) {
  const url = `${apiBase.replace(/\/$/, "")}/transactions/${txid}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`indexer returned HTTP ${res.status} for ${url}`);
  const tx = await res.json();
  const payload = tx.payload || tx.tx?.payload || tx.transaction?.payload;
  if (!payload) throw new Error("indexer response had no tx payload field");
  return payload;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.payload && !args.txid)) {
    console.log(
      "Usage:\n" +
        "  node recover-covenant.mjs --payload <payload_hex>\n" +
        "  node recover-covenant.mjs --txid <deploy_tx_id> --api <kaspa_rest_base_url>\n"
    );
    process.exit(args.help ? 0 : 1);
  }

  let payloadHex = args.payload;
  if (!payloadHex) {
    if (!args.api) {
      console.error("--txid needs --api <kaspa_rest_base_url> (a Kaspa indexer you trust)");
      process.exit(1);
    }
    payloadHex = await fetchPayload(args.txid, args.api);
  }

  const r = recoverFromPayload(payloadHex);
  console.log(JSON.stringify(r, null, 2));
  if (r.valid) {
    console.error(
      "\nOK: blake2b256(redeem) matches the on-chain commitment. You hold the exact redeem " +
        "script. Build a P2SH spend (pay-to-script-hash signature script = your satisfier + " +
        "this redeem) and sign it with your own wallet - no Covex server required."
    );
    process.exit(0);
  } else {
    console.error("\nFAIL: the embedded redeem does NOT hash to the committed value. Do not trust it.");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("recovery error:", e.message || e);
  process.exit(1);
});
