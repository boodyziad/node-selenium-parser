const args = process.argv.slice(2);

if (!(args.length == 2)) {
  console.log("USAGE: node index.js {PATH} {VERSION}");
  process.exit(1);
}

async function logUniques(path, version) {
  const Reader = require("./reader");
  let reader = new Reader(path, version);
  let uniques = await reader.read();
  console.log(uniques);
}

logUniques(...args);
