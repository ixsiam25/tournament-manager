"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "theme";

// First visit follows the device; after that the visitor's own choice wins.
// The root layout ships no `data-theme` at all, which the stylesheet reads as
// light, and this script — inlined in <head>, so it runs before paint —
// resolves the real value. With JS off the site stays light, which is the
// safer of the two to render un-corrected on paper-toned styling.
export const noFlashThemeScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}
})();
`;

// The theme lives on <html data-theme> — a mutable value outside React's
// render, changed by the inline no-flash script and by toggle() below.
// useSyncExternalStore (rather than effect+setState) is the correct way to
// read it without a hydration mismatch or a synchronous setState-in-effect.
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);

  // Track the OS setting too, so a visitor who has never touched the toggle
  // follows their device live rather than only at page load.
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  function handleSystemChange() {
    try {
      if (localStorage.getItem(THEME_STORAGE_KEY)) return;
    } catch {
      // localStorage unavailable — treat it as "no stored preference"
    }
    document.documentElement.setAttribute("data-theme", query.matches ? "dark" : "light");
    listeners.forEach((listener) => listener());
  }
  query.addEventListener("change", handleSystemChange);

  return () => {
    listeners.delete(callback);
    query.removeEventListener("change", handleSystemChange);
  };
}

function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function getServerSnapshot() {
  // Matches the server-rendered markup, which carries no `data-theme` and so
  // reads as light. A visitor whose device is dark sees the icon settle once
  // on hydration — unavoidable without knowing the OS setting server-side.
  return false;
}

function setDarkTheme(next: boolean) {
  document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  try {
    // Always an explicit value now: using the toggle at all means the visitor
    // has opted out of following their device.
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
  } catch {
    // localStorage unavailable — theme just won't persist across reloads
  }
  listeners.forEach((listener) => listener());
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    setDarkTheme(!isDark);
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center rounded-block border border-line text-muted-foreground hover:border-line-strong hover:text-foreground"
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" />
        </svg>
      )}
    </button>
  );
}
