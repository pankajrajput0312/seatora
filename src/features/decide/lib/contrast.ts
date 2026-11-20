/** WCAG 2 contrast of two sRGB colours (0–255 channels): 1 to 21. */
export function contrast(a: number[], b: number[]) {
  const lum = (rgb: number[]) =>
    rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** "#0b6e75" → [11, 110, 117]. */
export const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** A colour at `pct`% over white (a token's `/10` tint on the sheet). */
export const tintOf = (rgb: number[], pct = 10) => rgb.map((c) => (c * pct + 255 * (100 - pct)) / 100);
