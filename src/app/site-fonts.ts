import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

// The public site's fonts, on the public site's wrappers only (not the root layout): Next preloads a font on every page
// under the layout that imports it, and Decide (its own font) was downloading these three on every page. globals.css
// names the families directly ("GeistSans"…), so text outside the wrapper (dialogs portalled to <body>) keeps them.

// Geist Pixel Square from the geist package's file, declared here rather than imported from "geist/font/pixel/square":
// that one falls back to a monospace face, so the hero headline wrapped onto a fourth line while the font loaded and
// jumped when it swapped in. Its fallback is globals.css's "GeistPixelSquare Fallback" (Arial, size-adjusted to this
// font's measured width); next/font's own adjustFontFallback computes 109.6% from the font's average width, which still
// wraps the headline, so it is off. Named as before, so globals.css's family names still match.
const GeistPixelSquare = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Square.woff2",
  variable: "--font-geist-pixel-square",
  weight: "500",
  adjustFontFallback: false,
});

export const siteFonts = `${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`;
