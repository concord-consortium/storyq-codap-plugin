export const SQ: { lists: { [key: string]: string[] }, hints: { [key:string]:string} } = {
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
		positiveClassInstructions: 'The model will pay attention to one of the labels, with the remaining labels as ' +
			'“not” the label in question. The label we pay attention to is called the target label. \n' +
			'A target label is the most important among all labels for your model to recognize.',
		onwardInstructions: 'Let StoryQ know what to pay attention to in the texts.',
		testResultsName: 'The name of the model used in this test',
		testResultsDataset: 'The dataset whose texts were classified in this test',
		testResultsAccuracy: 'If the test dataset has labels, the percent of classifications that were correct',
		trainingSetupIteration: 'How many times the algorithm repeats its numerical approximation. More iterations' +
			' generally yield higher accuracy, up to a point, but training takes longer.',
		trainingResultsActive: 'If checked, the weights are shown for features as are the model\'s results in the training set',
		trainingResultsSettings: 'The settings in effect when this model was trained',
		trainingResultsAccuracy: 'The percent of predicted labels that are correct',
		trainingResultsFeatures: 'The features that were used to define this model',
		targetDatasetChoices: 'The dataset you choose will be used to train a model. ' +
			'It should have at least two attributes, one containing texts to analyze and the other containing ' +
			'labels with two values.',
		targetAttributeChoices: 'The target attribute should contain the texts to analyze.',
		targetClassAttributeChoices: 'The target labels attribute should have two values. These are the labels of each of the ' +
			'groups into which the texts will be classified.',
		targetLabelChoices: 'This will be the label your model tries to predict.',
		testingModelChoices: 'This model will be used to classify the dataset you choose as a test of how well' +
			' the model performs on a dataset other than the one that was used to train it.',
		testingDatasetChoices: 'This dataset will be analyzed by the chosen model. It should have at least one column' +
			' containing texts to be classified. It may or may not have a label column.',
		testingColumnChoices: 'The chosen column should contain the texts that are to be classified.',
		testingLabelsChoices: 'If this column is specified, it should contain two unique labels, one for each group.',
		featureTableCheckboxRemove: 'Click here to remove this feature from the next model you train.',
		featureTableCheckboxAdd: 'Click here to add this feature to the next model you train.',
		featureTableRemove: 'Removes this feature completely',
		featureCancel: 'Press this to cancel feature construction.',
		featureAdd: 'Press this button to begin constructing a feature.',
		featureDone: 'You can press this button when you have completed specifying a feature.',
		targetTwoGroups: 'This is the label for one of the two groups for the target texts.',
		testingChooseDataset: 'Please choose a dataset with texts to classify.',
		testingChooseModel: 'Please choose a model you have trained.',
		testingChooseAttribute: 'Please choose the attribute that contains the texts you wish to classify',
		testingTest: 'Click this button to carry out the classification test.',
		trainingStep: 'Click to complete the training without stepping',
		trainingTrain: 'Click this to train your model.',
		trainingOneStep: 'Click to move one iteration forward in training this model.',
		trainingSettings: 'Click to change the settings your model will use in training.',
		trainingCancel: 'Click to cancel the training of this model.',
		trainingNewModel: 'Click this to begin training a new model with the current set of features.',
		trainingMakeModelInactive: 'Click to make this model no longer active. This will hide its results' +
			' and weights',
		trainingMakeModelActive: 'Click to make this model active and show its results and weights.',
		trainingLockIntercept: 'Locking simplifies interpretation of feature weights but may introduce bias.',
		trainingPointFiveAsThreshold: 'The probability threshold defines the boundary between assignment to the two groups.',
	}
};