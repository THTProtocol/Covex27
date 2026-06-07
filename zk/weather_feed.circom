pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

// weather_feed.circom — Weather oracle feed / trigger stub (Covex)
// Proves temperature / event in range for parametric insurance etc.
template WeatherFeed() {
    signal input tempC;      // private or committed reading
    signal input threshold;  // public
    signal input triggered;  // public claim 0/1
    signal input valid;

    component above = LessThan(16);
    above.in[0] <== threshold;
    above.in[1] <== tempC + 100; // offset for signed-ish

    // triggered matches comparison (stub)
    signal match <== above.out;
    valid === 1;
}

component main { public [threshold, triggered, valid] } = WeatherFeed();
