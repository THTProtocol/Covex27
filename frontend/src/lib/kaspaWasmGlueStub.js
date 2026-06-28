// Empty stand-in for @onekeyfe/kaspa-wasm/kaspa_bg.wasm.js (aliased in vite.config.js).
//
// The real glue file embeds the ENTIRE ~11.5MB wasm a second time as a base64 string (the
// kaspa.js bundle is 15.6MB largely because of it). It is only reached through default()/
// __wbg_init -> require("./kaspa_bg.wasm.js"), a CommonJS require that already fails in a Vite
// browser bundle and is never used by our init path: loadKaspaWasm() always initializes via
// initSync(WebAssembly.compile(fetched kaspa_bg.wasm.bin)). Replacing the glue with this stub
// removes the duplicate 11.5MB payload from the vendor-kaspa-wasm chunk (the binary still ships
// exactly once as the served .bin asset that initSync fetches).
//
// Exported as the default so rolldown's CJS-interop hands it back to the package's
// require("./kaspa_bg.wasm.js"). If something ever calls it, throw loudly rather than silently
// returning a broken module.
function loadWebAssembly() {
  throw new Error(
    'kaspa-wasm glue (kaspa_bg.wasm.js) is stubbed out. Initialize via loadKaspaWasm() ' +
    '(initSync over the fetched kaspa_bg.wasm.bin), not default()/__wbg_init.'
  );
}
loadWebAssembly.supported = typeof WebAssembly !== 'undefined';

export default loadWebAssembly;
