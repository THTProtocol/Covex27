import * as snarkjs from "snarkjs";
import { mimc7Commitment } from "./src/lib/mimc7.js";
import { poseidon2 } from "poseidon-lite";
import fs from "fs";
const R=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
async function cfe(id){const b=new TextEncoder().encode(String(id));const d=new Uint8Array(await crypto.subtle.digest("SHA-256",b));let a=0n;for(const x of d)a=(a<<8n)|BigInt(x);return (a%R).toString();}
const Z="public/zk"; const out=[];
const cA = await cfe("covenantA"); const cB = await cfe("covenantB");
async function run(n,baseInput){
  const input={...baseInput, covenantId:cA};
  const {proof,publicSignals}=await snarkjs.groth16.fullProve(input,`${Z}/${n}/${n}.wasm`,`${Z}/${n}/${n}_final.zkey`);
  const vk=JSON.parse(fs.readFileSync(`${Z}/${n}/${n}_vkey.json`));
  const ok=await snarkjs.groth16.verify(vk,publicSignals,proof);
  const hasA=publicSignals.includes(cA); const hasB=publicSignals.includes(cB);
  out.push(`${n}: accept=${ok} valid0=${publicSignals[0]} boundToA=${hasA} replayB_blocked=${!hasB} n=${publicSignals.length}`);
  fs.writeFileSync("/tmp/h4e2e.txt",out.join("\n"));
}
await run("hash_preimage",{commitment_hash:mimc7Commitment(12345).toString(),preimage:"12345"});
await run("age_verification",{commitment:mimc7Commitment(1990),current_year:"2026",min_age:"18",birth_year:"1990"});
await run("escrow_2party",{deposit_daa:"1000000",timeout_daa:"100",current_daa:"1000150",outcome:"0"});
{ const s=7777n,seed=999n,faces=6n; const h=poseidon2([s,seed]); const roll=(h%faces)+1n; const q=(h-(roll-1n))/faces;
  await run("vrf_dice_roll",{secret:s.toString(),seed:seed.toString(),roll:roll.toString(),q:q.toString()}); }
out.push("DONE"); fs.writeFileSync("/tmp/h4e2e.txt",out.join("\n"));
