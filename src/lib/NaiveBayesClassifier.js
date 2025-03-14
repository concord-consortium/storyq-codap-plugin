/* 
 * @title: NaiveBayesClassifier
 * @description: NaiveBayesClassifier is a Multinomial Naive-Bayes Classifier that uses Laplace Smoothing.
 * @version: see static variable .VERSION
 * @author: Hadi Michael (http://hadi.io)
 * @repository: https://github.com/hadimichael/NaiveBayesClassifier
 * @license: BSD-3-Clause, see LICENSE file
*/

/**
 * The NaiveBayesClassifier object holds all the properties and methods used by the classifier.
 *
 * @property {String} VERSION - Library version number
 *
 * @constructor
 * @param  {Object} [options] - Options that can be used for intialisation
 * @param  {Function} options.tokenizer - Custom tokenization function
 * @return {Object} {@link NaiveBayesClassifier}
 */
var NaiveBayesClassifier = function(options) {
  /**
   * @constant
   * @property {String} - Instance version number
  */
  this.VERSION = NaiveBayesClassifier.VERSION;

  // DEFAULT TOKENIZER
  // =============================================================================
  /**
   * Given an input string, tokenize it into an array of word tokens.
   * This tokenizer adopts a naive "independant bag of words" assumption.
   * This is the default tokenization function used if the user does not provide one in {@link NaiveBayesClassifier#options}.
   *
   * @param  {String} text - Text to be tokenized
   * @return {Array} String tokens
   */
  var defaultTokenizer = function(text) {
    //remove punctuation from text (anything that isn't a word char or a space), and enforce lowercase
    var rgxPunctuation = new RegExp(/[^\w\s]/g);
    var sanitized = text.replace(rgxPunctuation, ' ').toLowerCase();

    return sanitized.split(/\s+/);
  };

  // OPTIONS
  // =============================================================================
  /**
   * Options defined at intialisation
   * @type {Object}
   * @property {Function} tokenizer - Tokenization function (can be custom provided or default).
   */
  this.options = {};

  if (!!options) {
    if (typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('NaiveBayesClassifier got invalid `options`: `' + options + '`. Please pass in an object.');
    }
    this.options = options;
  }

  this.tokenizer = this.options.tokenizer || defaultTokenizer;
  
  // VOCABULARY - initialise our vocabulary and its size
  // =============================================================================
  /**
   * Hashmap holding all words that have been learnt
   * @type {Object}
   */
  this.vocabulary = {};

  /**
   * A counter that holds the size of {@link NaiveBayesClassifier#vocabulary} hashmap
   * @type {Number}
   */
  this.vocabularySize = 0;

  // CATEGORIES - initilise categories
  // =============================================================================
  /**
   * Hashmap holding all category names
   * @type {Object}
   */
  this.categories = {};

  // PRIOR PROBABILITY: P(Cj) = docCount(C=cj) / Ndoc
  // =============================================================================

  /**
   * Document frequency table for each of our categories.
   * For each category, how many documents were mapped to it.
   * @type {Object}
   */
  this.docFrequencyCount = {}; //docCount(class)

  /**
   * A counter that holds the total number of documents we have learnt from.
   * @type {Number}
   */
  this.totalNumberOfDocuments = 0; //Ndoc => number of documents we have learned from

  // LIKELIHOOD: P(wi|Cj) = count(wi,cj) / SUM[(for w in v) count(w,cj)]
  // =============================================================================

  /**
   * Word frequency table for each of our categories.
   * For each category, how frequently did a given word appear.
   * @type {Object}
   */
  this.wordFrequencyCount = {}; //count(wi,cj)

  /**
   * Word count table for each of our categories
   * For each category, how many words in total were mapped to it.
   * @type {Object}
   */
  this.wordCount = {}; //SUM[(for w in v) count(w,cj)
};

/**
 * @constant
 * @property {String} - Library version number
 */
NaiveBayesClassifier.VERSION = '0.2.0'; // current version | Note: JS Functions are first class Objects

/**
 * Initialise a new classifier from an existing NaiveBayesClassifier object. 
 * For example, the existing object may have been retrieved from a database or localstorage.
 *
 * @param  {NaiveBayesClassifier} classifier - An existing NaiveBayesClassifier
 * @return {Object} {@link NaiveBayesClassifier}
 */
NaiveBayesClassifier.withClassifier = function(classifier) {
  var typeErrorMessage = 'The classifier provided is not of the correct type or has been corrupted.';
  if (typeof classifier !== 'object' || Array.isArray(classifier)) {
    throw new TypeError(typeErrorMessage);
  }

  var newClassifier = new NaiveBayesClassifier(classifier.options); //this should throw an error itself, if options isn't correct

  // Load in the vocabulary
  if (typeof classifier.vocabulary !== 'object' || Array.isArray(classifier.vocabulary)) {
    throw new TypeError(typeErrorMessage + ' Please check `classifier.vocabulary`:' + classifier.vocabulary);
  }
  Object
  .keys(classifier.vocabulary)
  .forEach(function(word) {
    newClassifier.addWordToVocabulary(word);
  });

  // Load in categories
  if (typeof classifier.categories !== 'object' || Array.isArray(classifier.categories)) {
    throw new TypeError(typeErrorMessage + ' Please check `classifier.categories`:' + classifier.categories);
  }
  Object
  .keys(classifier.categories)
  .forEach(function(category) {
    newClassifier.getOrCreateCategory(category);
  });

  // Load in other properties
  if (typeof classifier.docFrequencyCount !== 'object' || Array.isArray(classifier.docFrequencyCount)) {
    throw new TypeError(typeErrorMessage + ' Please check `classifier.docFrequencyCount`:' + classifier.docFrequencyCount);
  }
  newClassifier.docFrequencyCount = classifier.docFrequencyCount;

  if (typeof classifier.totalNumberOfDocuments !== 'number' || classifier.totalNumberOfDocuments < 0) {
    throw new TypeError(typeErrorMessage + ' Please check `classifier.totalNumberOfDocuments`:' + classifier.totalNumberOfDocuments);
  }
  newClassifier.totalNumberOfDocuments = classifier.totalNumberOfDocuments;
  
  if (typeof classifier.wordFrequencyCount !== 'object' || Array.isArray(classifier.wordFrequencyCount)) {
    throw new TypeError(typeErrorMessage + ' Please check `classifier.wordFrequencyCount`:' + classifier.wordFrequencyCount);
  }
  newClassifier.wordFrequencyCount = classifier.wordFrequencyCount;
  
  if (typeof classifier.wordCount !== 'object' || Array.isArray(classifier.wordCount)) {
    throw new TypeError(typeErrorMessage + ' Please check `classifier.wordCount`:' + classifier.wordCount);
  }
  newClassifier.wordCount = classifier.wordCount;

  //As the library gets updated in the future, I will include a mechanism to upgrade the classifier and handle backward compatibility
  // for the check, only look at major.minor and ignore .patch => do this by using parseFloat
  if (typeof parseFloat(classifier.VERSION) !== 'number' ||
    typeof parseFloat(NaiveBayesClassifier.VERSION) !== 'number' ||
    parseFloat(classifier.VERSION) !== parseFloat(NaiveBayesClassifier.VERSION)) {
    throw new Error('The classifier provided has a (major.minor) version number:' + classifier.VERSION + ' that is different to the library\'s current version number:' + NaiveBayesClassifier.VERSION);
  }

  return newClassifier;
};

/**
 * Add a word to our vocabulary and increment the {@link NaiveBayesClassifier#vocabularySize} counter.
 *
 * @param  {String} word - Word to be added to the vocabulary
 * @return {undefined}
 */
NaiveBayesClassifier.prototype.addWordToVocabulary = function(word) {
  if (!this.vocabulary[word]) {
    this.vocabulary[word] = true;
    this.vocabularySize += 1;
  }
};

/**
 * Retrieve a category.
 * If it does not exist, then initialize the necessary data structures for a new category.
 *
 * @param  {String} categoryName - Name of the category you want to get or create
 * @return {String} category
 */
NaiveBayesClassifier.prototype.getOrCreateCategory = function(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') {
    throw new TypeError('Category creator got invalid category name: `' + categoryName + '`. Please pass in a String.');
  }

  //simple singleton for each category
  if (!this.categories[categoryName]) {
    //setup counters
    this.docFrequencyCount[categoryName] = 0;
    this.wordFrequencyCount[categoryName] = {};
    this.wordCount[categoryName] = 0;

    //add new category to our list
    this.categories[categoryName] = true;
  }

  return this.categories[categoryName] ? categoryName : undefined;
};

/**
 * Build a frequency hashmap where the keys are the entries in `tokens`
 * and the values are the frequency of each entry (`token`).
 *
 * @param  {Array} tokens - Normalized word array
 * @return {Object} FrequencyTable
 */
NaiveBayesClassifier.prototype.frequencyTable = function(tokens) {
  var frequencyTable = {};

  tokens.forEach(function (token) {
    if (!frequencyTable[token]) {
      frequencyTable[token] = 1;
    } else {
      frequencyTable[token] += 1;
    }
  });

  return frequencyTable;
};

/**
 * Train our naive-bayes classifier by telling it what `category` some `text` corresponds to.
 *
 * @param  {String} text - Some text that should be learnt
 * @param  {String} category - The category to which the text provided belongs to
 * @return {Object} NaiveBayesClassifier
 */
NaiveBayesClassifier.prototype.learn = function(text, category) {
  var self = this; //get reference to instance

  category = self.getOrCreateCategory(category); //get or create a category

  self.docFrequencyCount[category] += 1; //update our count of how many documents mapped to this category
  self.totalNumberOfDocuments += 1; //update the total number of documents we have learned from

  var tokens = self.tokenizer(text); //break up the text into tokens
  var tokenFrequencyTable = self.frequencyTable(tokens); //get a frequency count for each token in the text

  // Update our vocabulary and our word frequency counts for this category
  // =============================================================================
  Object
  .keys(tokenFrequencyTable)
  .forEach(function(token) { //for each token in our tokenFrequencyTable
    
    self.addWordToVocabulary(token); //add this word to our vocabulary if not already existing

    var frequencyOfTokenInText = tokenFrequencyTable[token]; //look it up once, for speed

    //update the frequency information for this word in this category
    if (!self.wordFrequencyCount[category][token]) {
      self.wordFrequencyCount[category][token] = frequencyOfTokenInText; //set it for the first time
    } else {
      self.wordFrequencyCount[category][token] += frequencyOfTokenInText; //add to what's already there in the count
    }

    self.wordCount[category] += frequencyOfTokenInText; //add to the count of all words we have seen mapped to this category
  });

  return self;
};

/**
 * Calculate probability that a `token` belongs to a `category`
 *
 * @param  {String} token - The token (usually a word) for which we want to calculate a probability
 * @param  {String} category - The category we want to calculate for
 * @return {Number} probability
 */
NaiveBayesClassifier.prototype.tokenProbability = function(token, category) {
  // Recall => P(wi|Cj) = count(wi,cj) / SUM[(for w in v) count(w,cj)]
  // =============================================================================

  //how many times this word has occurred in documents mapped to this category
  var wordFrequencyCount = this.wordFrequencyCount[category][token] || 0; //count(wi,cj)

  //what is the count of all words that have ever been mapped to this category
  var wordCount = this.wordCount[category]; //SUM[(for w in v) count(w,cj)

  //use laplace Add-1 Smoothing equation
  //=> ( P(wi|Cj) = count(wi,cj) + 1 ) / ( SUM[(for w in v) count(w,cj)] + |VocabSize| )
  return ( wordFrequencyCount + 1 ) / ( wordCount + this.vocabularySize );
};

/**
 * Determine the category some `text` most likely belongs to.
 * Use Laplace (add-1) smoothing to adjust for words that do not appear in our vocabulary (i.e. unknown words).
 *
 * @param  {String} text - Raw text that needs to be tokenized and categorised.
 * @return {String} category - Category of “maximum a posteriori” (i.e. most likely category), or 'unclassified'
 * @return {Number} probability - The probablity for the category specified
 * @return {Object} categories - Hashmap of probabilities for each category 
 */
NaiveBayesClassifier.prototype.categorize = function (text) {
  var self = this,  //get reference to instance
      maxProbability = -Infinity,
      totalProbabilities = 0,
      cMAP = {}, //category of “maximum a posteriori” => most likely category
      categoryProbabilities = {}; //probabilities of all categories

  var tokens = self.tokenizer(text),
    tokenFrequencyTable = self.frequencyTable(tokens);

  Object
  .keys(self.categories)
  .forEach(function(category) { //for each category, find the probability of the text belonging to it
    if (!self.categories[category]) { return; } //ignore categories that have been switched off

    // 1. Find overall probability of this category
    //=> P(Cj) = docCount(C=cj) / Ndoc
    // =============================================================================
    
    //Put of all documents we've ever looked at, how many were mapped to this category
    var categoryProbability = self.docFrequencyCount[category] / self.totalNumberOfDocuments;

    //take the log to avoid underflow with large datasets - http://www.johndcook.com/blog/2012/07/26/avoiding-underflow-in-bayesian-computations/
    var logCategoryProbability = Math.log(categoryProbability); //start with P(Cj), we will add P(wi|Cj) incrementally below

    // 2. Find probability of each word in this category
    //=> P(wi|Cj) = count(wi,cj) / SUM[(for w in v) count(w,cj)]
    // =============================================================================

    Object
    .keys(tokenFrequencyTable)
    .forEach(function(token) { //for each token in our token frequency table

      //determine the log of the probability of this token belonging to the current category
      //=> log( P(w|c) )
      var tokenProbability = self.tokenProbability(token, category);
      //and add it to our running probability that the text belongs to the current category
      logCategoryProbability += Math.log(tokenProbability) * tokenFrequencyTable[token];

      // console.log('token: %s | category: `%s` | probability: %d', token, category, tokenProbability);
    });

    // 3. Find the most likely category, thus far...
    // =============================================================================

    categoryProbability = Math.exp(logCategoryProbability); //reverse the log and get an actual value
    totalProbabilities += categoryProbability; //calculate totals as we go, we'll use this to normalise later

    if (logCategoryProbability > maxProbability) { //find cMAP
      maxProbability = logCategoryProbability;
      cMAP = {
        category: category,
        probability: categoryProbability
      };
    }

    categoryProbabilities[category] = categoryProbability;
  });

  //normalise (out of 1) the probabilities, so that they are easier to relate to
  Object
  .keys(categoryProbabilities)
  .forEach(function(category) {
    categoryProbabilities[category] /= totalProbabilities;
  });

  return {
    category: cMAP.category || 'unclassified',
    probability: (cMAP.probability /= totalProbabilities) || -Infinity,
    categories: categoryProbabilities
  };
};

export default NaiveBayesClassifier;