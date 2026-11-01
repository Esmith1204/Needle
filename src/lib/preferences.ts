// Accessibility options, kept per device so they also apply on the sign-in pages.
// Each one except imageDescriptions becomes a data attribute on <html> that
// src/index.css styles. The inline script in index.html applies them before first paint.

export interface Preferences {
  theme: "dark" | "light";
  colors: "standard" | "contrast" | "colorblind" | "grayscale";
  fontSize: "small" | "default" | "large" | "xlarge";
  motion: "full" | "reduce";
  imageDescriptions: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  colors: "standard",
  fontSize: "default",
  motion: "full",
  imageDescriptions: false,
};

const STORAGE_KEY = "needle.preferences";

export function loadPreferences(): Preferences {
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage blocked: the choice still applies until the page reloads.
  }
}

export function applyPreferences({ theme, colors, fontSize, motion }: Preferences) {
  Object.assign(document.documentElement.dataset, { theme, colors, fontSize, motion });
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", paper);
}
