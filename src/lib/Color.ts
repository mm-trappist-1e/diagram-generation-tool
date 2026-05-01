import { RGBColor } from "react-color";

const clampChannel = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)));

const rgbToHsl = (color: RGBColor) => {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { hue: 0, saturation: 0, lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;

  return {
    hue: hue / 6,
    saturation,
    lightness,
  };
};

const hueToRgb = (p: number, q: number, t: number) => {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
};

const hslToRgb = (
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number | undefined
): RGBColor => {
  if (saturation === 0) {
    const channel = clampChannel(lightness * 255);
    return { r: channel, g: channel, b: channel, a: alpha ?? 1 };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    r: clampChannel(hueToRgb(p, q, hue + 1 / 3) * 255),
    g: clampChannel(hueToRgb(p, q, hue) * 255),
    b: clampChannel(hueToRgb(p, q, hue - 1 / 3) * 255),
    a: alpha ?? 1,
  };
};

export const getThemeTrainColor = (
  color: RGBColor,
  isDarkTheme: boolean
): RGBColor => {
  if (!isDarkTheme) return color;
  const { hue, saturation, lightness } = rgbToHsl(color);
  const nextLightness =
    lightness < 0.62 ? 0.62 + lightness * 0.18 : Math.min(0.88, lightness);
  const nextSaturation =
    saturation === 0 ? 0 : Math.min(1, Math.max(0.45, saturation * 1.05));
  return hslToRgb(hue, nextSaturation, nextLightness, color.a);
};

export const colorToRGBA = (c: RGBColor) =>
  `rgba(${c.r} ${c.g} ${c.b} / ${c.a ? c.a : 1})`;

export const colorToBackgroundRGBA = (c: RGBColor) =>
  `rgba(${c.r} ${c.g} ${c.b} / ${c.a ? c.a / 2 : 0.5})`;
