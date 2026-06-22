const snarkjs=require("C:/Users/User/Desktop/Covex/repo/zk/node_modules/snarkjs");
const fs=require("fs"),path=require("path");
(async()=>{
  const vkey=JSON.parse(fs.readFileSync("velocity_limit_vkey.json","utf8"));
  const demo=JSON.parse(fs.readFileSync("demo_proof.json","utf8"));
  // 1) served vkey verifies served demo proof
  const ok1=await snarkjs.groth16.verify(vkey,demo.publicSignals,demo.proof);
  console.log("SERVED demo_proof verifies under SERVED vkey ="+ok1+" valid_signal="+demo.publicSignals[0]);
  // 2) re-prove from SERVED wasm + SERVED final zkey, verify under SERVED vkey (pairing proof)
  const amounts=["1000","1500","2000","500","750","1250","800","1200"];
  const input={amounts,limit:"10000",windowId:"20260622",covenantId:"12975856296764178385096300579349863837782422391258567265242335968196494733975"};
  const wtns=path.join(__dirname,".wtns.served.tmp");
  await snarkjs.wtns.calculate(input,"velocity_limit.wasm",wtns);
  const {proof,publicSignals}=await snarkjs.groth16.prove("velocity_limit_final.zkey",wtns);
  const ok2=await snarkjs.groth16.verify(vkey,publicSignals,proof);
  console.log("FRESH proof from SERVED wasm+zkey verifies under SERVED vkey ="+ok2+" (zkey<->vkey pairing OK)");
  // 3) tamper a public signal -> reject
  const badPub=publicSignals.slice(); badPub[1]=(BigInt(badPub[1])+1n).toString();
  const ok3=await snarkjs.groth16.verify(vkey,badPub,proof);
  console.log("TAMPERED public signal verifies ="+ok3+" (must be false)");
  try{fs.unlinkSync(wtns);}catch(_){}
})().catch(e=>{console.error("ERR "+e.message);process.exit(1);});
