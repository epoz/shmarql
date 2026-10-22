/** The Editor color theme: shmarql has one light theme, so the Editor always uses "day". */

export type LodeonTheme = "day" | "night";

export function initializeTheme(): LodeonTheme {
  document.documentElement.dataset.theme = "day";
  return "day";
}
