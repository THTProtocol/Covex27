#!/usr/bin/env node
"use strict";
const { buildTree } = require("./tree");

async function main() {
    let data = "";
    process.stdin.on("data", (c) => { data += c; });
    process.stdin.on("end", async () => {
        const leaves = JSON.parse(data || "[]");
        const { root } = await buildTree(leaves.map((x) => BigInt(x)));
        process.stdout.write(root.toString());
    });
}
main();