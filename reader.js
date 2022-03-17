const fs = require("fs");

module.exports = class Reader {
  CHUNK_SIZE = 1000;
  DATE_RE = /\d{2}:\d{2}:\d{2}\.\d{3}/g;

  pendingChunk = "";

  constructor(path) {
    this.path = path;
  }

  extractDateIndexes(chunk) {
    let occurences = [];
    let remainingString = chunk;

    while (remainingString) {
      let occurence = remainingString.search(this.DATE_RE);
      if (occurence == -1) return occurences;
      let lastOccurence =
        occurences.length > 0 ? occurences[occurences.length - 1] + 12 : 0;
      occurences.push(occurence + lastOccurence);
      remainingString = remainingString.slice(occurence + 12);
    }

    return [];
  }

  extractCommandsFromPendingChunk() {
    let chunkString = this.pendingChunk.toString();
    return chunkString
      .split(this.DATE_RE)
      .slice(1)
      .map(command => {
        let start = command.indexOf(" - ") + 3 ? command.indexOf(" - ") + 3 : 0;
        let end = command.indexOf("(") ? command.indexOf("(") : command.length;
        return command.slice(start, end);
      });
  }

  processPendingChunk() {
    console.log(this.extractCommandsFromPendingChunk());
    this.pendingChunk = "";
  }

  async read() {
    let occurences = [];

    const stream = fs.createReadStream(this.path, {
      highWaterMark: this.CHUNK_SIZE
    });

    for await (const chunk of stream) {
      let chunkString = chunk.toString();
      occurences = this.extractDateIndexes(chunkString);

      if (occurences.length == 0) {
        this.pendingChunk += chunkString;
        continue;
      } else {
        this.pendingChunk += chunkString.slice(
          0,
          occurences[occurences.length - 1]
        );
        this.processPendingChunk();
        this.pendingChunk += chunkString.slice(
          occurences[occurences.length - 1]
        );
      }
    }
  }
};
