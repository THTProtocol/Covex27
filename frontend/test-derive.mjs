import init from '@onekeyfe/kaspa-wasm';

async function main() {
  const wasm = await init();

  const { Mnemonic, XPrv } = wasm;

  const tests = [
    { phrase: 'fitness narrow gap scheme fold regret faint neck blanket discover feel machine', expected: 'kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353' },
    { phrase: 'giggle alpha happy until wing zone cat argue april walnut uncover rate', expected: 'kaspatest:qpw2yxrmfudv56lvav32s8jz6uwqhp2x0x7fna0640qx3gwp70d55uue9uecs' },
    { phrase: 'upon machine office cup raw vehicle will jelly goddess mother lesson disagree', expected: 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m' },
  ];

  for (const t of tests) {
    try {
      const mnemonic = new Mnemonic(t.phrase);
      const seed = mnemonic.toSeed('');
      const xprv = new XPrv(seed);
      const derived = xprv.derivePath("m/44'/111111'/0'/0/0");
      const pk = derived.toPrivateKey();
      const addr = pk.toAddress('kaspatest');
      const addrStr = addr.toString();
      const match = addrStr === t.expected;
      console.log(match ? '✓ MATCH' : '✗ MISMATCH', addrStr);
      if (!match) console.log('  Expected:', t.expected);
      mnemonic.free();
      xprv.free();
      derived.free();
    } catch(e) {
      console.error('ERROR for', t.phrase.slice(0, 20) + '...', e.message);
    }
  }
}

main().catch(e => console.error('FATAL:', e));
