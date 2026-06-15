// Network-accurate Kaspa block-explorer URLs.
//
// Pointing a testnet address/tx at the mainnet explorer (explorer.kaspa.org) renders a
// "page not found", because that address/tx does not exist on mainnet. Always route by the
// covenant's / wallet's network. testnet-12 has no official explorer-tn12.kaspa.org, so we use
// the live community explorer kaspa.stream; mainnet and testnet-10 use the official explorers.
const BASE = {
  mainnet: 'https://explorer.kaspa.org',
  'mainnet-1': 'https://explorer.kaspa.org',
  'testnet-10': 'https://explorer-tn10.kaspa.org',
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
