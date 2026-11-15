import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { GeistPixelSquare } from "geist/font/pixel/square"; // not "geist/font/pixel": that preloads all five pixel faces

// The public site's fonts, on the public site's wrappers only (not the root layout): Next preloads a font on every page
// under the layout that imports it, and Decide (its own font) was downloading these three on every page. globals.css
// names the families directly ("GeistSans"…), so text outside the wrapper (dialogs portalled to <body>) keeps them.
export const siteFonts = `${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`;
