// Features are assigned no color until they are actually added. This avoids jumping ahead in the color cycle when
// we create a short lived feature that isn't actually saved, which happens surprisingly frequently.
export const kNoColor = "NO_COLOR";
export const featureColors = ["#ffe671", "#dbb6fb", "#45f1eb", "#a8e620", "#fb93e8", "#9ce1ff"];
export const featureColorNames: Record<string, string> = {
  "#ffe671": "Yellow",
  "#dbb6fb": "Purple",
  "#45f1eb": "Turquoise",
  "#a8e620": "Green",
  "#fb93e8": "Pink",
  "#9ce1ff": "Blue"
};
// Every word extracted by the single words feature gets this color rather than one from the cycle.
// It happens to equal featureColors[0] today, but the two are independent constants.
export const ngramColor = "#ffe671";
let featureColorIndex = 0;

export function getFeatureColor() {
  const color = featureColors[featureColorIndex];
  featureColorIndex = (featureColorIndex + 1) % featureColors.length;
  return color;
}

// The color an extracted word takes: the single words feature's own color, or yellow when it has none.
export function ngramTokenColor(featureColor?: string) {
  return featureColor && featureColor !== kNoColor ? featureColor : ngramColor;
}

export function normalizeHex(color: string) {
  const hex = color.trim().toLowerCase();
  const shorthand = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  return shorthand ? `#${shorthand[1]}${shorthand[1]}${shorthand[2]}${shorthand[2]}${shorthand[3]}${shorthand[3]}` : hex;
}

export function isPaletteColor(color: string) {
  return featureColors.some(paletteColor => normalizeHex(paletteColor) === normalizeHex(color));
}
