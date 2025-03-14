interface ISQ {
  lists: Record<string, string[]>;
  hints: Record<string, string>;
}
export const SQ: ISQ = {
  lists: {
    personalPronouns: ["I", "you", "he", "she", "it", "we", "they", "them", "us", "him", "her", "his",
      "hers", "its", "theirs", "our", "your"],
    prepositions: ["aboard","after","around","behind","between","despite","failing","in","minus","off",
      "out","plus","through","toward","unlike","via","about","against",
      "as","below","beyond","down","following","inside","near","on","outside","regarding","throughout",
      "towards","until","with","above","along","at","beneath","but","during","for","into","next","onto","over",
      "since","till","under","up","within","across","among","before","beside","by","except","from","like","of",
      "opposite","past","than","to","underneath","upon","without"],
  },
  hints: {
    positiveClassInstructions: 'The TARGET LABEL is the label that your model will be trained to identify. ' +
      'The model will compute the probability that a text should have this label. Any other labels will be ' +
      'considered “not the [target label]”.',
    onwardInstructions: '',
    featuresDef: 'A feature is anything about the text that helps you distinguish between the labels. It can be a word, ' +
      'a phrase, punctuation, etc. A feature is perceived by humans, and also detectable by computing tools.',
    testResultsName: 'This is the name of the model used for this test.',
    testResultsDataset: 'This is the data set whose texts were classified for this test.',
    testResultsAccuracy: 'If the testing data set has labels, this is the percentage of predictions this ' +
      'model made correctly.',
    trainingSetupIteration: 'Iterations is the number of times the machine learning algorithm adjusts the weights ' +
      'of the features to improve the model. More iterations generally make the model more accurate, ' +
      'but the training process will take longer.',
    trainingResultsActive: 'If checked, the model’s results and feature weights are shown in your tables and graphs.',
    trainingResultsSettings: 'The settings used to train the model(s).',
    trainingResultsAccuracy: 'ACCURACY is percentage of correctly predicted texts.',
    trainingResultsFeatures: 'The feature(s) used to train this model.',
    targetDatasetChoices: 'Here are all the data tables available in this document. ' +
      'To train your model, choose a data table that has at least two columns, one with text and the other with labels.',
    targetDatasetChosen: 'This is your training data. ' +
      'If you choose a different data set, your setup will be cleared and you will need to create ' +
      'a new setup for the new data set.',
    targetAttributeChoices: 'Which column in your data set contains the texts you want to analyze?',
    targetAttributeChosen: 'This is the column that contains the text you want to train your model with. ' +
      'If you choose a different column, your setup will be updated with the new text.',
    targetClassAttributeChoices: 'Here are all the column headers in the training data. ' +
      'Which column contains the labels that you want to train your model with? ' +
      'These labels will be used to classify your text into categories.',
    targetClassAttributeChosen: 'This is the column that contains the labels you want to train your model with. ' +
      'If you choose a different column, your setup will be updated with the new labels.',
    targetTwoGroups: 'This is one of the labels.',
    targetLabelChoices: 'This will be the label your model tries to predict.',
    testingModelChoices: 'Which model do you want to try out on a new data set? This model will be tested to see ' +
      'how well it performs on a new data set.',
    testingDatasetChoices: 'What data set do you want to use to test the model? The data set should have at least one ' +
      'column containing texts to classify. The data set is not required to have a column for the labels, ' +
      'but that can help.',
    testingColumnChoices: 'Which column in the data set contains the texts you want the model to classify?',
    testingLabelsChoices: 'Here are all the column headers in the testing data. Which column contains the labels ' +
      'that you want to test your model with? These labels will be used to classify your text into categories.',
    featureTableCheckboxRemove: 'Uncheck this box to exclude this feature from the next model you train.',
    featureTableCheckboxAdd: 'Check this box to add this feature to the next model you train.',
    featureTableRemove: 'Remove this feature completely',
    featureCancel: 'Click to cancel feature creation.',
    featureAdd: 'Click to create a feature.',
    featureDone: 'Click when you have completed creating the feature.',
    testingChooseDataset: 'Please choose a dataset with texts to classify.',
    testingChooseModel: 'Please choose a model you have trained.',
    testingChooseAttribute: 'Please choose the attribute that contains the texts you wish to classify',
    testingTest: 'Click to test the model on the chosen testing data.',
    trainingStep: 'Click to complete the training without stepping',
    trainingTrain: 'Click to train your model.',
    trainingOneStep: 'Click to train your model one iteration at a time.',
    trainingSettings: 'Click to change the training settings.',
    trainingCancel: 'Click to cancel the training of this model.',
    trainingNewModel: 'Click to begin training a new model with features you created.',
    trainingMakeModelInactive: 'Uncheck this box to hide this model’s results and feature weights.',
    trainingMakeModelActive: 'Check this box to show this model’s results and feature weights.',
    trainingLockIntercept: 'The intercept is a term in the logistic regression formula. ' +
      'When the intercept is locked at 0, it is easy to interpret the coefficients, which are the feature weights. ' +
      'However, locking intercept may introduce bias.',
    trainingPointFiveAsThreshold: 'The machine learning algorithm will compute the probability of each case to have ' +
      'the target label. 100% is the most probable and 0% is the least probable. A probability threshold is a cutoff ' +
      'value for assigning the target label. A probability greater than the threshold is assigned the target label. ' +
      'A probability equal to or less than it will not.',
  }
};
