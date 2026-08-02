"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "theme";

// The root layout renders <html data-theme="dark"> directly, so dark is
// correct even before this runs (or with JS disabled entirely). This script
// only needs to flip it back to light when that was the visitor's stored
// choice — inlined in <head> so it happens before paint, no flash.
export const noFlashThemeScript = `
(function () {
  try {
    if (localStorage.getItem('${THEME_STORAGE_KEY}') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
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
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function getServerSnapshot() {
  // Matches the new default the no-flash script applies, so the toggle's
  // icon doesn't flip right after hydration for a visitor with no stored
  // preference.
  return true;
}

function setDarkTheme(next: boolean) {
  document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  try {
    if (next) {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
    }
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
      className="flex h-8 w-8 items-center justify-center rounded-block border-2 border-white/25 text-white/70 hover:border-white hover:text-white"
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
