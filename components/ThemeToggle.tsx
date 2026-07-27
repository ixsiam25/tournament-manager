"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "theme";

// Runs before paint (inlined in the root layout's <head>) to avoid a flash
// of the wrong theme. Light is the default — only dark is ever persisted.
export const noFlashThemeScript = `
(function () {
  try {
    if (localStorage.getItem('${THEME_STORAGE_KEY}') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
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
  return false;
}

function setDarkTheme(next: boolean) {
  document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  try {
    if (next) {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
    } else {
      localStorage.removeItem(THEME_STORAGE_KEY);
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
      className="flex h-8 w-8 items-center justify-center rounded-block border-2 border-line text-muted hover:border-line-strong hover:text-foreground"
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
