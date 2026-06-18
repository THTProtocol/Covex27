// Network-accurate Kaspa block-explorer URLs. We standardize on the kaspa.stream explorer
// for every network: mainnet at kaspa.stream, testnet-12 at tn12.kaspa.stream. Pointing a
// testnet address/tx at the mainnet explorer renders a "page not found" (it does not exist on
// mainnet), so always route by the covenant's / wallet's network.
const BASE = {
  mainnet: 'https://kaspa.stream',
  'mainnet-1': 'https://kaspa.stream',
  'testnet-10': 'https://tn10.kaspa.stream',
  'testnet-12': 'https://tn12.kaspa.stream',
};

function resolveNet(network) {
  let n = network;
  if (!n && typeof localStorage !== 'undefined') n = localStorage.getItem('kaspaNetwork');
  return BASE[n] ? n : 'testnet-12';
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
