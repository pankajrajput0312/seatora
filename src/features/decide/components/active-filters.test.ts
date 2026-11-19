import { expect, it } from "vitest";
import { foldChips } from "./active-filters";
import { clears } from "./filter-form";

it("more than six chips of one field fold into one in the first one's place, its × the page without any of them", () => {
  const courses = Array.from({ length: 7 }, (_, i) => ({ label: `C${i}`, param: "course", href: `/decide/last-ranks?rank=5&course=${[0, 1, 2, 3, 4, 5, 6].filter((x) => x !== i).map((x) => `c${x}`).join("&course=")}&q=x` }));
  const q = { label: "Search", param: "q", href: "/decide/last-ranks?rank=5" };
  expect(foldChips([q, ...courses])).toEqual([q, { label: "7 courses", param: "course", href: "/decide/last-ranks?rank=5&q=x" }]);
  // Six or fewer stay chips; a field with no noun says "filters"; nothing else left: the bare path.
  expect(foldChips(courses.slice(0, 6))).toEqual(courses.slice(0, 6));
  const odd = courses.map((c) => ({ ...c, param: "zz", href: "/p?zz=1" }));
  expect(foldChips(odd)).toEqual([{ label: "7 filters", param: "zz", href: "/p" }]);
});

it("a Clear shows only when it changes the page: its query is not the address's, the page number aside", () => {
  const now = new URLSearchParams("rank=5&cat=OBC&layout=table&page=3");
  expect(clears("/decide/last-ranks?cat=OBC&rank=5&layout=table", now)).toBe(false);
  expect(clears("/decide/last-ranks?rank=5&cat=OBC&layout=table", new URLSearchParams("rank=5&cat=OBC&layout=table&course=a"))).toBe(true);
  expect(clears("/decide/last-ranks", new URLSearchParams())).toBe(false);
});
