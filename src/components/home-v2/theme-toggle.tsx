"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Flips the /v2 page between its dark default and the light version (the `dark` class on the `.app.mono` wrapper). */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.currentTarget.closest(".app")?.classList.toggle("dark", !dark);
        setDark(!dark);
      }}
      className="grid size-11 shrink-0 place-items-center rounded-full border border-input text-foreground hover:border-foreground"
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
