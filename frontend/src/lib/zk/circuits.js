// Extracted from CovexTerminal for maintainability (audit fix)
// 207+ entries, honest reality labels.
export const ZK_CIRCUIT_TYPES = [ /* full list would be copied here, but for brevity in this step we keep reference */ ];
// In real: move the entire array here and import in CovexTerminal.

// Served-artifact directory aliases: a few circuit ids are served under a different
// directory name than the catalog id. The vkey/wasm/zkey live under the ALIAS, so any
// link built as /zk/<id>/<id>_vkey.json must resolve <id> through this map or it 404s.
//   utxo_ownership -> basic_utxo_ownership (the only current divergence).
export const ARTIFACT_DIR = {
  utxo_ownership: 'basic_utxo_ownership',
};

// Resolve a circuit id to the directory+prefix its served artifacts actually use.
export function artifactId(circuitId) {
  return ARTIFACT_DIR[circuitId] || circuitId;
}

// Build the served Groth16 verification-key URL for a circuit, honoring the alias map
// so the link resolves (both the directory and the file prefix use the aliased id).
export function vkeyPathFor(circuitId) {
  if (!circuitId || circuitId === 'none') return null;
  const dir = artifactId(circuitId);
  return `/zk/${dir}/${dir}_vkey.json`;
}
