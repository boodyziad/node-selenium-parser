"use strict";
const args = process.argv.slice(2);

if (!(args.length == 2)) {
  console.log("USAGE: node index.js {PATH} {VERSION}");
  process.exit(1);
}

const Reader = require("./reader");
let reader = new Reader(args[0], args[1]);
reader.read();
