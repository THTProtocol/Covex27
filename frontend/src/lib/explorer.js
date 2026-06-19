// Kaspa block-explorer URLs. Covex standardizes on the kaspa.stream explorer for mainnet,
// the only user-visible network. Every covenant / wallet link routes to mainnet at kaspa.stream.
const BASE = {
  mainnet: 'https://kaspa.stream',
  'mainnet-1': 'https://kaspa.stream',
};

function resolveNet(network) {
  let n = network;
  if (!n && typeof localStorage !== 'undefined') n = localStorage.getItem('kaspaNetwork');
  return BASE[n] ? n : 'mainnet';
}

export function explorerBase(network) {
  return BASE[resolveNet(network)];
}

// Covex tx ids carry an outpoint suffix (":0"); the explorer expects the bare tx hash.
export function explorerTxUrl(txId, network) {
  const tx = String(txId || '').split(':')[0];
  return `${explorerBase(network)}/txs/${encodeURIComponent(tx)}`;
}

export function explorerAddressUrl(address, network) {
  return `${explorerBase(network)}/addresses/${encodeURIComponent(address || '')}`;
}
