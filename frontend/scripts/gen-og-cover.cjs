// Generates frontend/public/og-cover.png (1200x630) from an authored SVG,
// embedding the CURRENT Covex logo (covex-logo-512.png) on a premium dark
// brand background with the kaspa-green (#49EACB) accent and the tagline.
//
// Run from repo/frontend:  node scripts/gen-og-cover.cjs
// Requires @resvg/resvg-js (dev-only, install with --no-save if absent).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const pub = path.join(__dirname, '..', 'public');
const logoPath = path.join(pub, 'covex-logo-512.png');
const outPath = path.join(pub, 'og-cover.png');

const logoB64 = fs.readFileSync(logoPath).toString('base64');
const logoHref = `data:image/png;base64,${logoB64}`;

// 1200x630 link-preview canvas. Logo at left, wordmark + tagline at right.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070a12"/>
      <stop offset="0.5" stop-color="#0a121d"/>
      <stop offset="1" stop-color="#06141a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.32" cy="0.5" r="0.6">
      <stop offset="0" stop-color="#49EACB" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#49EACB" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#70C7BA"/>
      <stop offset="1" stop-color="#49EACB"/>
    </linearGradient>
    <linearGradient id="word" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#bfeee6"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- BlockDAG motif, faint, upper-right -->
  <g stroke="#49EACB" stroke-opacity="0.14" stroke-width="2" fill="none">
    <path d="M1130 90 L1030 150 M1130 90 L1040 50 M1040 50 L940 110 M1030 150 L940 110 M1030 150 L1060 250 M940 110 L840 165"/>
  </g>
  <g fill="#49EACB" fill-opacity="0.42">
    <circle cx="1130" cy="90" r="5"/><circle cx="1030" cy="150" r="7"/><circle cx="940" cy="110" r="5"/><circle cx="1060" cy="250" r="6"/>
  </g>
  <!-- BlockDAG motif, faint, lower-left -->
  <g stroke="#49EACB" stroke-opacity="0.12" stroke-width="2" fill="none">
    <path d="M70 560 L170 500 M70 560 L160 600 M160 600 L260 540 M170 500 L260 540 M170 500 L140 400"/>
  </g>
  <g fill="#49EACB" fill-opacity="0.36">
    <circle cx="70" cy="560" r="5"/><circle cx="170" cy="500" r="7"/><circle cx="260" cy="540" r="5"/><circle cx="140" cy="400" r="6"/>
  </g>

  <!-- soft accent glow behind the logo -->
  <ellipse cx="300" cy="315" rx="210" ry="210" fill="#49EACB" fill-opacity="0.22" filter="url(#soft)"/>

  <!-- brand card so the logo's black plate reads as an intentional tile -->
  <rect x="118" y="133" width="364" height="364" rx="44" fill="#05070d"/>
  <rect x="118" y="133" width="364" height="364" rx="44" fill="none" stroke="#49EACB" stroke-opacity="0.30" stroke-width="2"/>

  <!-- the current Covex logo -->
  <image xlink:href="${logoHref}" x="130" y="145" width="340" height="340" preserveAspectRatio="xMidYMid meet"/>

  <!-- wordmark + tagline, right column -->
  <text x="540" y="285"
        font-family="Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="120" font-weight="800" letter-spacing="14" fill="url(#word)">COVEX</text>
  <rect x="544" y="320" width="320" height="6" rx="3" fill="url(#accent)"/>
  <text x="544" y="385"
        font-family="Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="33" font-weight="600" letter-spacing="0.5" fill="#d6ece8">The Covenant Explorer and Studio</text>
  <text x="544" y="432"
        font-family="Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="33" font-weight="600" letter-spacing="0.5" fill="#d6ece8">for Kaspa</text>
  <text x="544" y="492"
        font-family="Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="19" font-weight="500" letter-spacing="3" fill="#5f8a82">REAL ON-CHAIN DATA  ·  NON-CUSTODIAL  ·  KASPA MAINNET</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true },
  background: '#070a12',
});
const png = resvg.render().asPng();
fs.writeFileSync(outPath, png);
console.log('Wrote', outPath, png.length, 'bytes');
