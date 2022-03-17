const fs = require("fs");
const versions = require("./versions");

module.exports = class Reader {
  CHUNK_SIZE = 1000;
  DATE_RE = /\d{2}:\d{2}:\d{2}\.\d{3}/g;

  uniqueCommands = 0;
  pairs = [];

  pendingChunk = "";

  constructor(path, version) {
    this.path = path;
    this.commandStartIdentifier = versions[version].commandStartIdentifier;
    this.responseIdentifier = versions[version].responseIdentifier;
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
      })
      .filter(
        command =>
          command.includes(this.commandStartIdentifier) ||
          command.includes(this.responseIdentifier)
      );
  }

  processPendingChunk() {
    let commands = this.extractCommandsFromPendingChunk();
    if (commands.length) {
      commands.forEach(command => {
        if (command.includes(this.commandStartIdentifier))
          this.pairs.push({
            start: command
          });
        else if (this.pairs.length && !this.pairs[this.pairs.length - 1].end)
          this.pairs[this.pairs.length - 1].end = command;
      });
    }
    this.pendingChunk = "";
  }

  TwoPairsEqual(pair, other) {
    return pair.start == other.start && pair.end == other.end;
  }

  setNumberOfUniqueCommands() {
    let currentPairIndex = 0;
    while (currentPairIndex < this.pairs.length) {
      if (currentPairIndex < this.pairs.length - 1) {
        if (
          !this.TwoPairsEqual(
            this.pairs[currentPairIndex],
            this.pairs[currentPairIndex + 1]
          )
        ) {
          this.uniqueCommands++;
        }
      } else {
        if (
          !this.TwoPairsEqual(
            this.pairs[currentPairIndex],
            this.pairs[currentPairIndex - 1]
          )
        ) {
          this.uniqueCommands++;
        }
      }

      currentPairIndex++;
    }
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
    this.setNumberOfUniqueCommands();
    return this.uniqueCommands;
  }
};
