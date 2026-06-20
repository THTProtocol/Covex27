"use strict";
// Phase 4b: generate valid + tampered proofs bound to a test covenant_id for the 3 promoted circuits.
const snarkjs = require("/root/Covex27/zk/node_modules/snarkjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mimcjs = require("/root/Covex27/zk/node_modules/circomlibjs");

const ZK = "/root/Covex27/zk";
const CID = process.argv[2] || "phase4b-test-covenant-0001";
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
function cfe(id){ const d=crypto.createHash("sha256").update(Buffer.from(String(id),"utf8")).digest(); let acc=0n; for(const b of d) acc=(acc<<8n)|BigInt(b); return (acc % R).toString(); }
const COV = cfe(CID);

let mimc7;
async function getMiMC7(){ if(!mimc7) mimc7=await mimcjs.buildMimc7(); return mimc7; }
async function boardHash(board, player){ const m=await getMiMC7(); const F=m.F; let s=m.hash(F.zero,F.zero); for(const v of board) s=m.hash(F.add(s,F.e(BigInt(v))),F.zero); s=m.hash(F.add(s,F.e(BigInt(player))),F.zero); return F.toObject(s); }

// MiMC7 tree helpers (mirror privacy_mixer/lib/tree.js)
async function mimcHash(val){ const m=await getMiMC7(); const F=m.F; return F.toObject(m.hash(F.e(val),F.zero)); }
async function mimcHash2(l,r){ const m=await getMiMC7(); const F=m.F; return F.toObject(m.hash(F.add(F.e(l),F.e(r)),F.zero)); }
async function amountCommitment(a){ return mimcHash(BigInt(a)); }
async function mixerCommitment(secret,nk,amtComm){ const h0=await mimcHash(BigInt(secret)); const h1=await mimcHash(BigInt(h0)+BigInt(nk)); const h2=await mimcHash(BigInt(h1)+BigInt(amtComm)); return h2; }
async function leafFromNote(secret,nk,amount){ const amtComm=await amountCommitment(amount); const commitment=await mixerCommitment(secret,nk,amtComm); return { leaf: await mimcHash(BigInt(commitment)), amountCommitment: amtComm }; }
async function nullifierFromNote(secret,nk){ return mimcHash(BigInt(secret)+BigInt(nk)); }

async function proveTictactoe(){
  const WASM=`${ZK}/games/tictactoe/output/tictactoe_v1_js/tictactoe_v1.wasm`;
  const ZKEY=`${ZK}/games/tictactoe/output/tictactoe_v1_final.zkey`;
  const moveCell=4, player=1;
  const oldBoard=new Array(9).fill(0); const newBoard=[...oldBoard]; newBoard[moveCell]=player;
  const oldHash=await boardHash(oldBoard,player); const newHash=await boardHash(newBoard, player===1?2:1);
  const input={ old_board_hash:oldHash.toString(), new_board_hash:newHash.toString(), player_to_move:String(player), move_cell:String(moveCell), game_status:"0", old_board:oldBoard.map(String), new_board:newBoard.map(String), covenantId: COV };
  return snarkjs.groth16.fullProve(input, WASM, ZKEY);
}
async function proveConnect4(){
  const WASM=`${ZK}/games/connect4/output/connect4_v1_js/connect4_v1.wasm`;
  const ZKEY=`${ZK}/games/connect4/output/connect4_v1_final.zkey`;
  const col=3, player=1, landingRow=0; const idx=(c,r)=>c+r*7;
  const oldBoard=new Array(42).fill(0); const newBoard=[...oldBoard]; newBoard[idx(col,landingRow)]=player;
  const oldHash=await boardHash(oldBoard,player); const newHash=await boardHash(newBoard, player===1?2:1);
  const input={ old_board_hash:oldHash.toString(), new_board_hash:newHash.toString(), player_to_move:String(player), move_column:String(col), game_status:"0", old_board:oldBoard.map(String), new_board:newBoard.map(String), landing_row:String(landingRow), win_witness_cells:["0","0","0","0"], win_witness_active:"0", covenantId: COV };
  return snarkjs.groth16.fullProve(input, WASM, ZKEY);
}
async function proveMixer(){
  const WASM=`${ZK}/privacy_mixer/output/privacy_mixer_v1_js/privacy_mixer_v1.wasm`;
  const ZKEY=`${ZK}/privacy_mixer/output/privacy_mixer_v1_final.zkey`;
  const secret=111111n, nk=222222n, amount=100000000n, recipientHash=333333n;
  const { leaf, amountCommitment:amtComm } = await leafFromNote(secret,nk,amount);
  const nullifier = await nullifierFromNote(secret,nk);
  // Single leaf at index 0; sibling at each level is the zero-subtree root.
  const DEPTH=16; let zero=0n; const path_elements=[]; const path_indices=[];
  // root: hash leaf up with zero-subtree siblings
  let cur=leaf; let zsub=0n; // zero leaf value is 0n
  for(let i=0;i<DEPTH;i++){ path_elements.push(zsub.toString()); path_indices.push("0"); cur=await mimcHash2(cur, zsub); zsub=await mimcHash2(zsub, zsub); }
  const root=cur;
  const input={ merkle_root:root.toString(), nullifier:nullifier.toString(), recipient_hash:recipientHash.toString(), amount_commitment:amtComm.toString(), min_amount:amount.toString(), max_amount:amount.toString(), covenantId: COV, secret:secret.toString(), nullifier_key:nk.toString(), amount:amount.toString(), path_elements, path_indices };
  return snarkjs.groth16.fullProve(input, WASM, ZKEY);
}

async function main(){
  const which=process.argv[3];
  const map={ tictactoe: proveTictactoe, connect4: proveConnect4, mixer: proveMixer };
  const fn=map[which]; if(!fn){ console.error("unknown circuit "+which); process.exit(1); }
  const { proof, publicSignals } = await fn();
  const out={ covenant_id: CID, covenantId_fe: COV, proof, publicSignals };
  const dir=`${ZK}/ceremony_phase4b/proofs`; fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(`${dir}/${which}_valid.json`, JSON.stringify(out,null,2));
  console.log(JSON.stringify({circuit:which, publicSignals, covenantId_fe:COV, bound: publicSignals.includes(COV)}));
}
main().catch(e=>{ console.error(e.stack||String(e)); process.exit(1); });
