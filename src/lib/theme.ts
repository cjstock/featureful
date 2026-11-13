/**
 * Theme preference: "system" (default, follows the OS), "light" or "dark", stored in a cookie.
 * The root layout adds the `dark` class for "dark"; THEME_SCRIPT (inline in <head>) handles
 * "system" before paint and follows OS changes. No Next imports: safe in client components.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "featureful_theme";

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system";
}

/** The toggle's cycle: System → Light → Dark → System. */
export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

/**
 * Inline <head> script: reads the cookie, and while the preference is "system" mirrors the OS
 * setting onto the `dark` class, now and whenever it changes. "light"/"dark" are left alone
 * (the server already rendered them; the toggle applies them client-side).
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var c=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),t=c?c[1]:"system";if(t!=="light"&&t!=="dark")d.classList.toggle("dark",m.matches)}a();m.addEventListener("change",a)}catch(e){}})()`;
