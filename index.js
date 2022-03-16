const args = process.argv.slice(2);

if (!(args.length == 2)) {
  console.log("USAGE: node index.js {PATH} {VERSION}");
  process.exit(1);
}
