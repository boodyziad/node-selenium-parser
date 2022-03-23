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
    let dateOccurences = Reader.extractDateIndexes(chunkString);
    let dates = [];
    for (let i = 0; i < dateOccurences.length; i++) {
      dates.push(chunkString.slice(dateOccurences[i], dateOccurences[i] + 12));
    }

    let currentDateIndex = -1;

    return chunkString
      .split(DATE_RE)
      .slice(1)
      .map(command => {
        currentDateIndex++;
        let start = command.indexOf(" - ") + 3 ? command.indexOf(" - ") + 3 : 0;
        let end = command.indexOf("(") ? command.indexOf("(") : command.length;
        return {
          command: command.slice(start, end),
          date: dates[currentDateIndex]
        };
      })
      .filter(
        command =>
          command.command.includes(startId) || command.command.includes(endId)
      );
  }

  static TwoPairsEqual(pair, other) {
    return (
      pair &&
      other &&
      pair.start &&
      pair.end &&
      other.start &&
      other.end &&
      pair.start.command == other.start.command &&
      pair.end.command == other.end.command
    );
  }

  static getUniqueCommands(pairs) {
    let currentPairIndex = 0;
    let uniqueCommands = [];

    while (currentPairIndex < pairs.length) {
      if (currentPairIndex < pairs.length - 1) {
        if (
          !Reader.TwoPairsEqual(
            pairs[currentPairIndex],
            pairs[currentPairIndex + 1]
          )
        ) {
          if (
            Reader.TwoPairsEqual(
              pairs[currentPairIndex],
              pairs[currentPairIndex - 1]
            )
          ) {
            uniqueCommands[uniqueCommands.length - 1].end =
              pairs[currentPairIndex].end;
          } else {
            uniqueCommands.push(pairs[currentPairIndex]);
          }
        } else {
          if (
            !Reader.TwoPairsEqual(
              pairs[currentPairIndex],
              pairs[currentPairIndex - 1]
            )
          ) {
            uniqueCommands.push({
              start: pairs[currentPairIndex].start
            });
          }
        }
      } else {
        if (
          !Reader.TwoPairsEqual(
            pairs[currentPairIndex],
            pairs[currentPairIndex - 1]
          )
        ) {
          uniqueCommands.push(pairs[currentPairIndex]);
        }
      }

      currentPairIndex++;
    }

    return uniqueCommands;
  }

  static parseDate(date) {
    let parts = date.split(":").map(part => parseFloat(part));
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  static calculateCommandDuration(command) {
    if (!command.end) return 0;

    let startDate = this.parseDate(command.start.date);
    let endDate = this.parseDate(command.end.date);

    return parseFloat((endDate - startDate).toFixed(3));
  }

  static calculateInsideTime(uniqueCommands) {
    let insideTime = 0;
    uniqueCommands.forEach(
      command => (insideTime += this.calculateCommandDuration(command))
    );
    return insideTime.toFixed(3);
  }

  static calculateOutsideTime(pairs, insideTime) {
    return (
      this.calculateCommandDuration({
        start: pairs[0].start,
        end: pairs[pairs.length - 1].start
      }) - insideTime
    ).toFixed(3);
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
          if (command.command.includes(startId))
            pairs.push({
              start: command
            });
          else if (pairs.length && !pairs[pairs.length - 1].end)
            (pairs[pairs.length - 1].end = command), command;
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
      let uniquePairs = Reader.getUniqueCommands(pairs);
      let insideTime = Reader.calculateInsideTime(uniquePairs);
      let perRequestInsideTime = (insideTime / uniquePairs.length).toFixed(3);
      let outsideTime = Reader.calculateOutsideTime(pairs, insideTime);
      let perRequestOutsideTime = (outsideTime / uniquePairs.length).toFixed(3);

      callback({
        numberOfUniqueCommands: uniquePairs.length,
        insideTime: insideTime,
        perRequestInsideTime: perRequestInsideTime,
        outsideTime: outsideTime,
        perRequestOutsideTime: perRequestOutsideTime
      });
    });
  }
};
