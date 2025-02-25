# Testing StoryQ

StoryQ requires datasets to work properly. There are two codap3 documents saved in this directory that will allow you to test the plugin easily.

## Setting up a test document

1. Load Codap3. The latest can be found at https://codap3.concord.org/branch/main/.
2. Drag one of the `.codap3` files into the Codap3 window.
  - `StoryQ Local.codap3` includes a copy of StoryQ running locally at http://localhost:3000.
  - `StoryQ Latest.codap3` includes a copy of the latest version of StoryQ hosted at https://models-resources.concord.org/storyq/branch/master/index.html.
  - `Ice Cream Reviews.codap3` does not include a copy of StoryQ in it, so you will have to drag the url of a hosted version into the document. This can be useful if you're testing an in development version on its own branch.

## Testing the plugin

StoryQ is a complex plugin with lots of moving parts, but here's a quick overview of how to use it.

### Setup Tab

Here you'll tell StoryQ which training dataset and attributes to use. You'll always want to use the following settings:

1. For training data, choose `ice cream training`.
2. For text, choose `text`.
3. For labels, choose `rating`.
4. Then select the `positive` radio button.

### Features Tab

Here you'll determine which features your AI models might care about. There are many options and it's often good to test a variety.

#### First dropdown
**contain** True if a case includes the item specified in the second drop down.
**not contain** True if a case does not include the item specified in the second drop down.
**start with** *Currently works like contain, which is incorrect.*
**end with** *Currently works like contain, which is incorrect.*
**count** Displays the number of times the item specified in the second drop down occurs in each case. But for the purposes of training and testing models, this works the same as contain.
**single words** This will create a separate contain feature for each word that appears in the dataset. There are a couple of exceptions:
  - Stop words (listed in `stop_words.ts`) will be excluded if `Ignore stopwords` is checked.
  - Words that appear infrequently (default less than 4, but the user can change this) are excluded.
**other columns as features** I'm not sure how these are supposed to work or if they are working properly.

#### Second dropdown
The first five options described above allow you to select from a second dropdown.
**text** Matches any specified string.
**punctuation** I believe this technically works the same way as text but is included to encourage students to experiment with using punctuation.
**any number** Matches a very naive regular expression to find numbers: `[0-9]+`.
**any item from a list** Matches an item from a predefined list or a dataset.
  - `personalPronouns` and `prepositions` are defined in `lists.ts`.
  - The remaining options come from the datasets in the document. The values in the first attribute are used.

### Training Tab
