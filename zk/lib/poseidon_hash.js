"use strict";
const { buildPoseidon } = require("circomlibjs");

let _poseidon = null;

async function poseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

async function hash(inputs) {
  const p = await poseidon();
  const F = p.F;
  const res = p(inputs.map((x) => F.e(x)));
  return F.toObject(res).toString();
}

module.exports = { poseidon, hash };