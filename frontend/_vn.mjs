import * as snarkjs from "snarkjs";
import { mimc7Commitment } from "./src/lib/mimc7.js";
import fs from "fs";
const out = [];
async function run(name, input, tamperIdx) {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `public/zk/${name}/${name}.wasm`, `public/zk/${name}/${name}_final.zkey`);
    const vk = JSON.parse(fs.readFileSync(`public/zk/${name}/${name}_vkey.json`));
    const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
    const t = [...publicSignals]; t[tamperIdx] = (BigInt(t[tamperIdx]) + 1n).toString();
    const bad = await snarkjs.groth16.verify(vk, t, proof);
    out.push(`${name}: accept=${ok} tamperReject=${!bad} n=${publicSignals.length} sig=${JSON.stringify(publicSignals)}`);
  } catch (e) { out.push(`${name}: ERROR ${(e.message||e).slice(0,120)}`); }
  fs.writeFileSync("_vn_result.txt", out.join("\n"));
}
await run("hash_preimage", { commitment_hash: mimc7Commitment(12345).toString(), preimage: "12345" }, 0);
await run("timelock_absolute", { current_daa: "5000", lock_threshold: "1000" }, 0);
await run("relative_timelock", { current_daa: "2000", reference_daa: "1000", lock_duration: "500" }, 0);
out.push("DONE"); fs.writeFileSync("_vn_result.txt", out.join("\n"));
