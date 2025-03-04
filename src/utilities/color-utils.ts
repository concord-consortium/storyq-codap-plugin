// Features are assigned no color until they are actually added. This avoids jumping ahead in the color cycle when
// we create a short lived feature that isn't actually saved, which happens surprisingly frequently.
export const kNoColor = "NO_COLOR";
const featureColors = ["#ffe671", "#dbb6fb", "#45f1eb", "#a8e620", "#fb93e8", "#9ce1ff"];
let featureColorIndex = 0;

export function getFeatureColor() {
  const color = featureColors[featureColorIndex];
  featureColorIndex = (featureColorIndex + 1) % featureColors.length;
  return color;
}
