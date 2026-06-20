import * as snarkjs from "snarkjs";
import { mimc7Commitment } from "./src/lib/mimc7.js";
import { poseidon1, poseidon2, poseidon3, poseidon5 } from "poseidon-lite";
import fs from "fs";
const R=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
async function cfe(id){const b=new TextEncoder().encode(String(id));const d=new Uint8Array(await crypto.subtle.digest("SHA-256",b));let a=0n;for(const x of d)a=(a<<8n)|BigInt(x);return (a%R).toString();}
const Z="public/zk"; const out=[]; const cv = await cfe("testcov");
async function run(n,base){ try{
  const input={...base,covenantId:cv};
  const {proof,publicSignals}=await snarkjs.groth16.fullProve(input,`${Z}/${n}/${n}.wasm`,`${Z}/${n}/${n}_final.zkey`);
  const vk=JSON.parse(fs.readFileSync(`${Z}/${n}/${n}_vkey.json`));
  const ok=await snarkjs.groth16.verify(vk,publicSignals,proof);
  out.push(`${ok&&publicSignals.includes(cv)?"PASS":"FAIL"} ${n} (accept=${ok} bound=${publicSignals.includes(cv)})`);
}catch(e){out.push(`FAIL ${n} ERR ${(e.message||e).slice(0,60)}`);} fs.writeFileSync("/tmp/all14.txt",out.join("\n")); }
await run("merkle_membership",{rootHash:"20473339414381364284988912838485478706292217748325897174032535818078518775705",secretLeaf:"42"});
await run("age_verification",{commitment:mimc7Commitment(1990),current_year:"2026",min_age:"18",birth_year:"1990"});
await run("escrow_2party",{deposit_daa:"1000000",timeout_daa:"100",current_daa:"1000150",outcome:"0"});
await run("range_proof",{commitment:mimc7Commitment(42).toString(),min:"0",max:"100",value:"42"});
{const s=7777n,sd=999n;const h=poseidon2([s,sd]);const r=(h%6n)+1n;const q=(h-(r-1n))/6n;await run("vrf_dice_roll",{secret:s.toString(),seed:sd.toString(),roll:r.toString(),q:q.toString()});}
{const s=123n;const nu=poseidon1([s]);const mr=poseidon2([s,nu]);await run("nullifier_set",{nullifier:nu.toString(),merkle_root:mr.toString(),secret:s.toString()});}
{const x=11n,y=22n,a=33n,r=44n,ss=55n;const uh=poseidon5([x,y,a,r,ss]);await run("basic_utxo_ownership",{pubkey_x:x.toString(),pubkey_y:y.toString(),amount_commit:a.toString(),owner_sig_r:r.toString(),owner_sig_s:ss.toString(),utxo_hash:uh.toString()});}
await run("hash_preimage",{commitment_hash:mimc7Commitment(12345).toString(),preimage:"12345"});
await run("timelock_absolute",{current_daa:"5000",lock_threshold:"1000"});
await run("relative_timelock",{current_daa:"2000",reference_daa:"1000",lock_duration:"500"});
{const s=555n,sd=12345n,k=7n;await run("vrf_random",{vrf_secret:s.toString(),seed:sd.toString(),output_val:poseidon3([s,sd,k]).toString(),pub_vrf_key:k.toString()});}
await run("turn_timer",{current_daa:"1000",last_move_daa:"950",max_delta:"100",move_hash:"42"});
{const sh=321n,c=2n,v=500n;await run("script_constraint",{script_hash:sh.toString(),constraint_id:c.toString(),value:v.toString(),public_root:poseidon3([sh,c,v]).toString()});}
await run("pot_split_math",{total_pot:"10000",fee_bps:"300",pot_return_bps:"200",winner_share:"9500",fee:"300",ret:"200"});
out.push("DONE"); fs.writeFileSync("/tmp/all14.txt",out.join("\n"));
