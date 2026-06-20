import * as snarkjs from "snarkjs";
import { poseidon3 } from "poseidon-lite";
import fs from "fs";
const Z="public/zk"; const out=[];
async function run(n,input,ti){
  try{
    const {proof,publicSignals}=await snarkjs.groth16.fullProve(input,`${Z}/${n}/${n}.wasm`,`${Z}/${n}/${n}_final.zkey`);
    const vk=JSON.parse(fs.readFileSync(`${Z}/${n}/${n}_vkey.json`));
    const ok=await snarkjs.groth16.verify(vk,publicSignals,proof);
    const t=[...publicSignals]; t[ti]=(BigInt(t[ti])+1n).toString();
    const bad=await snarkjs.groth16.verify(vk,t,proof);
    out.push(`${n}: accept=${ok} tamperReject=${!bad} n=${publicSignals.length} sig=${JSON.stringify(publicSignals)}`);
  }catch(e){ out.push(`${n}: ERROR ${(e.message||e).slice(0,110)}`);}
  fs.writeFileSync("/tmp/zkv.txt",out.join("\n"));
}
{ const s=12345n,seed=99n,key=7n; const ov=poseidon3([s,seed,key]);
  await run("vrf_random",{vrf_secret:s.toString(),seed:seed.toString(),output_val:ov.toString(),pub_vrf_key:key.toString()},0); }
await run("turn_timer",{current_daa:"1000",last_move_daa:"950",max_delta:"100",move_hash:"42"},0);
{ const sh=88n,cid=2n,val=500n; const pr=poseidon3([sh,cid,val]);
  await run("script_constraint",{script_hash:sh.toString(),constraint_id:cid.toString(),value:val.toString(),public_root:pr.toString()},0); }
await run("pot_split_math",{total_pot:"10000",fee_bps:"300",pot_return_bps:"200",winner_share:"9500",fee:"300",ret:"200"},0);
out.push("DONE"); fs.writeFileSync("/tmp/zkv.txt",out.join("\n"));
