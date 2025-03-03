const featureColors = ["#ffe671", "#dbb6fb", "#45f1eb", "#a8e620", "#fb93e8", "#9ce1ff"];
let featureColorIndex = 0;

export function getFeatureColor() {
  const color = featureColors[featureColorIndex];
  featureColorIndex = (featureColorIndex + 1) % featureColors.length;
  return color;
}
