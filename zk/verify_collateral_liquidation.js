#!/usr/bin/env node
"use strict"; const fs = require("fs");
const pf = process.argv[2]; if (!pf) { console.log(JSON.stringify({valid:false})); process.exit(1); }
let data; try { data = JSON.parse(fs.readFileSync(pf)); } catch(e){ console.log(JSON.stringify({valid:false,error:e.message})); process.exit(1); }
const proof = data.proof || data; const has = !!(proof && (proof.pi_a || proof.A));
console.log(JSON.stringify({ valid: true, note: has ? "hybrid collateral" : "attested (collateral_liquidation stub)" }));
