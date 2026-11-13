"use client";

import { useLayoutEffect, useState } from "react";
import { nextTheme, THEME_COOKIE, THEME_LABELS, type Theme } from "@/lib/theme";
import { Button } from "@/components/ui/button";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Header toggle cycling System → Light → Dark; remembered in a cookie for a year. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);

  // The layout re-renders <html>'s class from the cookie on refreshes (e.g. switching identity),
  // which can drop a client-applied `dark`; re-apply after every commit to stay in sync.
  useLayoutEffect(() => applyTheme(theme));

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[nextTheme(theme)]}`}
      title="Switch theme"
      onClick={() => {
        const next = nextTheme(theme);
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        setTheme(next);
      }}
    >
      Theme: {THEME_LABELS[theme]}
    </Button>
  );
}
