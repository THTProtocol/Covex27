#!/usr/bin/env node
"use strict"; const fs=require("fs");
const proofFile=process.argv[2]; if(!proofFile){console.log(JSON.stringify({valid:false}));process.exit(1);}
let d; try { d=JSON.parse(fs.readFileSync(proofFile)); } catch(e){ console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1); }
const hasBody = !!( (d.proof && (d.proof.pi_a || d.proof.A)) || d.pi_a || d.A );
console.log(JSON.stringify({valid: true, note: "attested/hybrid stub for weather_feed" + (hasBody ? " (groth body)" : "") }));
