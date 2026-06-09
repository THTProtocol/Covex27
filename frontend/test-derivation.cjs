// Test script to verify TN12 derivation matches expected addresses
const path = require('path');
const init = require(path.resolve(__dirname, 'node_modules/@onekeyfe/kaspa-wasm/kaspa.js'));

(async () => {
  const wasm = await init.default ? await init.default() : await init();
  
  const Mnemonic = wasm.Mnemonic;
  const XPrv = wasm.XPrv;
  
  const tests = [
    { 
      phrase: 'fitness narrow gap scheme fold regret faint neck blanket discover feel machine',
      expected: 'kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353'
    },
    { 
      phrase: 'giggle alpha happy until wing zone cat argue april walnut uncover rate',
      expected: 'kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs'
    },
    { 
      phrase: 'upon machine office cup raw vehicle will jelly goddess mother lesson disagree',
      expected: 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m'
    },
  ];
  
  let allMatch = true;
  for (const t of tests) {
    const mnemonic = new Mnemonic(t.phrase);
    const seed = mnemonic.toSeed('');
    const xprv = new XPrv(seed);
    const derived = xprv.derivePath("m/44'/111111'/0'/0/0");
    const pk = derived.toPrivateKey();
    const addr = pk.toAddress('kaspatest');
    const addrStr = addr.toString();
    const match = addrStr === t.expected;
    console.log(match ? '✓ MATCH' : '✗ MISMATCH');
    console.log('  Expected:', t.expected);
    console.log('  Got:     ', addrStr);
    if (!match) allMatch = false;
    mnemonic.free();
    xprv.free();
    derived.free();
  }
  console.log('\nAll match:', allMatch);
})().catch(e => console.error('FATAL:', e));
