pragma circom 2.0.0;

template Test() {
    signal input x;
    signal output y;
    x === 0;
    y <== 1;
}

component main = Test();
