import { allTokenizer, wordTokenizer } from "./one_hot";

// to make the two boolean parameters easier to understand
const ignoreStopWords = true;
const dontIgnoreStopWords = false;
const ignorePunctuation = true;
const dontIgnorePunctuation = false;

const challengingReview = "I had Royal Milk Tea not bad with boba no jelly. It was a little expensive $5.00+ for a small about the size of a grande at Starbucks. Didn't try anything else.";

describe("wordTokenizer", () => {
  it("tokenizes empty strings", () => {
    expect(wordTokenizer("", ignoreStopWords, ignorePunctuation)).toStrictEqual([]);
  });

  it("tokenizes words", () => {
    expect(wordTokenizer("hello world", ignoreStopWords, ignorePunctuation)).toStrictEqual(["hello", "world"]);
  });

  it("ignores stop words", () => {
    expect(wordTokenizer("hello the world", ignoreStopWords, ignorePunctuation)).toStrictEqual(["hello", "world"]);
  });

  it("does not ignore stop words", () => {
    expect(wordTokenizer("hello the world", dontIgnoreStopWords, ignorePunctuation)).toStrictEqual(["hello", "the", "world"]);
  });

  it("ignores punctuation", () => {
    expect(wordTokenizer("hello, the world", ignoreStopWords, ignorePunctuation)).toStrictEqual(["hello", "world"]);
  });

  it("does not ignore punctuation", () => {
    expect(wordTokenizer("hello, the world", ignoreStopWords, dontIgnorePunctuation)).toStrictEqual(["hello", ",", "world"]);
  });

  it("tokenizes emojis", () => {
    expect(wordTokenizer("I, 🧡 all pepperoni 🍕", ignoreStopWords, ignorePunctuation)).toStrictEqual(["🧡", "pepperoni", "🍕"]);
    expect(wordTokenizer("I, 🧡 all pepperoni 🍕", ignoreStopWords, dontIgnorePunctuation)).toStrictEqual([",", "🧡", "pepperoni", "🍕"]);
    expect(wordTokenizer("I, 🧡 all pepperoni 🍕", dontIgnoreStopWords, ignorePunctuation)).toStrictEqual(["i", "🧡", "all", "pepperoni", "🍕"]);
    expect(wordTokenizer("I, 🧡 all pepperoni 🍕", dontIgnoreStopWords, dontIgnorePunctuation)).toStrictEqual(["i", ",", "🧡", "all", "pepperoni", "🍕"]);
  });

  it("tokenizes emoticons", () => {
    expect(wordTokenizer("I, am :)", ignoreStopWords, ignorePunctuation)).toStrictEqual([":)"]);
    expect(wordTokenizer("I, am :)", ignoreStopWords, dontIgnorePunctuation)).toStrictEqual([",", ":)"]);
    expect(wordTokenizer("I, am :)", dontIgnoreStopWords, ignorePunctuation)).toStrictEqual(["i", "am", ":)"]);
    expect(wordTokenizer("I, am :)", dontIgnoreStopWords, dontIgnorePunctuation)).toStrictEqual(["i", ",", "am", ":)"]);

    expect(wordTokenizer("🍕 makes me }:-) and not }:(", ignoreStopWords, ignorePunctuation)).toStrictEqual(["🍕", "makes", "}:-)", "}:("]);
    expect(wordTokenizer("🍕 makes me }:-) and not }:(", ignoreStopWords, dontIgnorePunctuation)).toStrictEqual(["🍕", "makes", "}:-)", "}:("]);
    expect(wordTokenizer("🍕 makes me }:-) and not }:(", dontIgnoreStopWords, ignorePunctuation)).toStrictEqual(["🍕", "makes", "me", "}:-)", "and", "not", "}:("]);
    expect(wordTokenizer("🍕 makes me }:-) and not }:(", dontIgnoreStopWords, dontIgnorePunctuation)).toStrictEqual(["🍕", "makes", "me", "}:-)", "and", "not", "}:("]);
  });

  it("tokenizes challenging reviews", () => {
    expect(wordTokenizer(challengingReview, dontIgnoreStopWords, ignorePunctuation)).toStrictEqual([
      "i", "had", "royal", "milk", "tea", "not", "bad", "with", "boba", "no", "jelly", "it", "was", "a", "little",
      "expensive", "5.00", "for", "a", "small", "about", "the", "size", "of", "a", "grande", "at", "starbucks",
      "didn't", "try", "anything", "else"
    ]);
  });
});

describe("allTokenizer", () => {
  it("tokenizes empty strings", () => {
    expect(allTokenizer("")).toStrictEqual([]);
  });

  it("tokenizes words", () => {
    expect(allTokenizer("hello world")).toStrictEqual(["hello", " ", "world"]);
    expect(allTokenizer("Hello world!")).toStrictEqual(["Hello", " ", "world", "!"]);
  });

  it("tokenizes challenging reviews", () => {
    expect(allTokenizer(challengingReview)).toStrictEqual([
      "I", " ", "had", " ", "Royal", " ", "Milk", " ", "Tea", " ", "not", " ", "bad", " ", "with", " ", "boba", " ",
      "no", " ", "jelly", ".", " ", "It", " ", "was", " ", "a", " ", "little", " ", "expensive", " ", "$", "5.00", "+",
      " ", "for", " ", "a", " ", "small", " ", "about", " ", "the", " ", "size", " ", "of", " ", "a", " ", "grande",
      " ", "at", " ", "Starbucks", ".", " ", "Didn't", " ", "try", " ", "anything", " ", "else", "."
    ]);
  });
});
