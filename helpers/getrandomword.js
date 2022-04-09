function getWord () {
    var fs = require("fs");
    var text = fs.readFileSync("./assets/word_list.txt", "utf-8");
    var textByLine = text.split("\n");
    var randomWord = textByLine[Math.floor(Math.random() * textByLine.length)];
    return randomWord; //gets a random word from a list for testing
}

module.exports = getWord;