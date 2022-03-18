"use strict";
const fs = require("fs");
const versions = require("./versions");

const DATE_RE = /\d{2}:\d{2}:\d{2}\.\d{3}/g;
const CHUNK_SIZE = 1000;

module.exports = class Reader {
  constructor(path, version) {
    this.path = path;
    this.commandStartIdentifier = versions[version].commandStartIdentifier;
    this.responseIdentifier = versions[version].responseIdentifier;
  }

  static extractDateIndexes(chunk) {
    let occurences = [];
    let remainingString = chunk;

    while (remainingString) {
      let occurence = remainingString.search(DATE_RE);
      if (occurence == -1) return occurences;
      let lastOccurence =
        occurences.length > 0 ? occurences[occurences.length - 1] + 12 : 0;
      occurences.push(occurence + lastOccurence);
      remainingString = remainingString.slice(occurence + 12);
    }

    return [];
  }

  static extractCommandsFromPendingChunk(pendingChunk, startId, endId) {
    let chunkString = pendingChunk.toString();
    return chunkString
      .split(DATE_RE)
      .slice(1)
      .map(command => {
        let start = command.indexOf(" - ") + 3 ? command.indexOf(" - ") + 3 : 0;
        let end = command.indexOf("(") ? command.indexOf("(") : command.length;
        return command.slice(start, end);
      })
      .filter(command => command.includes(startId) || command.includes(endId));
  }

  static TwoPairsEqual(pair, other) {
    return pair.start == other.start && pair.end == other.end;
  }

  static getNumberOfUniqueCommands(pairs) {
    let currentPairIndex = 0;
    let uniqueCommands = 0;

    while (currentPairIndex < pairs.length) {
      if (currentPairIndex < pairs.length - 1) {
        if (
          !Reader.TwoPairsEqual(
            pairs[currentPairIndex],
            pairs[currentPairIndex + 1]
          )
        ) {
          uniqueCommands++;
        }
      } else {
        if (
          !Reader.TwoPairsEqual(
            pairs[currentPairIndex],
            pairs[currentPairIndex - 1]
          )
        ) {
          uniqueCommands++;
        }
      }

      currentPairIndex++;
    }

    return uniqueCommands;
  }

  read(callback) {
    let occurences = [];
    let pairs = [];
    let pendingChunk = "";

    let startId = this.commandStartIdentifier;
    let endId = this.responseIdentifier;

    const processPendingChunk = () => {
      let commands = Reader.extractCommandsFromPendingChunk(
        pendingChunk,
        startId,
        endId
      );
      if (commands.length) {
        commands.forEach(command => {
          if (command.includes(startId))
            pairs.push({
              start: command
            });
          else if (pairs.length && !pairs[pairs.length - 1].end)
            pairs[pairs.length - 1].end = command;
        });
      }
      pendingChunk = "";
    };

    const stream = fs.createReadStream(this.path, {
      highWaterMark: CHUNK_SIZE
    });

    stream.on("data", function(chunk) {
      let chunkString = chunk.toString();
      occurences = Reader.extractDateIndexes(chunkString);

      if (occurences.length == 0) {
        pendingChunk += chunkString;
        return;
      } else {
        pendingChunk += chunkString.slice(0, occurences[occurences.length - 1]);
        processPendingChunk();
        pendingChunk += chunkString.slice(occurences[occurences.length - 1]);
      }
    });

    stream.on("close", () => {
      callback(Reader.getNumberOfUniqueCommands(pairs));
    });
  }
};
