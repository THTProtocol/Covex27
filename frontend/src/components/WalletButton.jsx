import { ConnectButton } from '@kasflow/wallet-connector/react';

export default function WalletButton() {
  return (
    <ConnectButton
      label="CONNECT WALLET"
      showBalance={false}
      showNetwork={false}
    />
  );
}
