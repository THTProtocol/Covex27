import * as snarkjs from "snarkjs";
import { poseidon3 } from "poseidon-lite";
import fs from "fs";
const Z="public/zk";
async function g(n,input,f){ const {proof,publicSignals}=await snarkjs.groth16.fullProve(input,`${Z}/${n}/${n}.wasm`,`${Z}/${n}/${n}_final.zkey`); fs.writeFileSync(f,JSON.stringify({proof,publicSignals})); }
{ const s=555n,seed=12345n,k=7n; await g("vrf_random",{vrf_secret:s.toString(),seed:seed.toString(),output_val:poseidon3([s,seed,k]).toString(),pub_vrf_key:k.toString()},"/tmp/g_vrf.json"); }
await g("turn_timer",{current_daa:"2000",last_move_daa:"1980",max_delta:"100",move_hash:"9"},"/tmp/g_tt.json");
{ const sh=321n,c=2n,v=500n; await g("script_constraint",{script_hash:sh.toString(),constraint_id:c.toString(),value:v.toString(),public_root:poseidon3([sh,c,v]).toString()},"/tmp/g_sc.json"); }
await g("pot_split_math",{total_pot:"20000",fee_bps:"500",pot_return_bps:"100",winner_share:"18800",fee:"1000",ret:"200"},"/tmp/g_ps.json");
console.log("GEN_OK");
