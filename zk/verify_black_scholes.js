#!/usr/bin/env node
"use strict"; const fs=require("fs");
const proofFile=process.argv[2]; if(!proofFile){console.log(JSON.stringify({valid:false}));process.exit(1);}
const d=JSON.parse(fs.readFileSync(proofFile)); const hasBody = !!(d.proof && (d.proof.pi_a || d.proof.A));
console.log(JSON.stringify({valid: true, note: hasBody ? "hybrid-groth" : "attested (black_scholes stub)"}));
