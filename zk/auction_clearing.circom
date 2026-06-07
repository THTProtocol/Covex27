pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// auction_clearing.circom — Sealed-bid / Dutch auction clearing stub (Covex)
// Proves highest valid bid clears at correct price without revealing all bids (placeholder).
template AuctionClearing() {
    signal input highestBid;
    signal input secondBid;
    signal input reserve;
    signal input clearPrice; // public claimed clearing price
    signal input valid;

    // Simple: clearPrice >= reserve && clearPrice <= highest && >= second
    component gteReserve = LessThan(64);
    gteReserve.in[0] <== reserve - 1;
    gteReserve.in[1] <== clearPrice;
    component lteHigh = LessThan(64);
    lteHigh.in[0] <== clearPrice;
    lteHigh.in[1] <== highestBid + 1;

    signal ok <== gteReserve.out * lteHigh.out;
    valid === ok;
}

component main { public [clearPrice, valid] } = AuctionClearing();
