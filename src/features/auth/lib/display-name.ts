/**
 * A person's name as shown (the sidebar's account footer, the account page): a word repeated next to itself once
 * ("Pankaj pankaj" → "Pankaj"), each word title-cased when it was typed in one case ("rahul SHARMA" → "Rahul Sharma",
 * "o'brien" → "O'Brien"); a word in mixed case stays as typed ("McDonald", "DSouza"). "" for a blank name.
 */
export function displayName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .filter((w, i) => w.toLowerCase() !== words[i - 1]?.toLowerCase())
    .map((w) => (w === w.toLowerCase() || w === w.toUpperCase() ? w.toLowerCase().replace(/(^|[-'’])\p{L}/gu, (m) => m.toUpperCase()) : w))
    .join(" ");
}
