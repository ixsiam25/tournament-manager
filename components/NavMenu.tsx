"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/standings", label: "Standings" },
  { href: "/players", label: "Player Standings" },
  { href: "/roster", label: "Players" },
  { href: "/teams", label: "Teams" },
  { href: "/predictions", label: "Champions Prediction" },
  { href: "/register", label: "Register" },
  { href: "/auction", label: "Auction" },
  { href: "/legacy", label: "Legacy" },
];

const SEASON_ONLY_HREFS = new Set(["/fixtures", "/standings", "/players", "/roster", "/teams", "/predictions"]);

export function NavMenu({
  showRegister,
  showAuction,
  hasActiveSeason,
}: {
  showRegister: boolean;
  showAuction: boolean;
  hasActiveSeason: boolean;
}) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS.filter((item) => {
    if (item.href === "/register") return showRegister;
    if (item.href === "/auction") return showAuction;
    if (SEASON_ONLY_HREFS.has(item.href)) return hasActiveSeason;
    return true;
  });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close whenever navigation actually happens. Adjusting state during
  // render (rather than in an effect) avoids an extra cascading render —
  // this is React's own recommended pattern for "reset state when a prop
  // changes": https://react.dev/learn/you-might-not-need-an-effect
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-block border-2 border-white/25 px-3.5 py-1.5 text-sm font-bold uppercase tracking-wide text-white hover:border-white hover:bg-white hover:text-black"
      >
        Menu
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={"transition-transform duration-150 " + (open ? "rotate-180" : "")}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 origin-top-right animate-card-in overflow-hidden rounded-block-lg border-2 border-line-strong bg-surface shadow-block"
        >
          <nav className="py-1.5">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  className={
                    "block border-l-4 px-4 py-2 text-sm font-bold " +
                    (active
                      ? "border-pitch bg-pitch/10 text-pitch-dark"
                      : "border-transparent hover:bg-background")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line py-1.5">
            <Link
              href="/manager/login"
              prefetch={false}
              role="menuitem"
              className="block px-4 py-2 text-sm font-medium text-muted hover:bg-background hover:text-foreground"
            >
              Manager login
            </Link>
            <Link
              href="/admin/login"
              prefetch={false}
              role="menuitem"
              className="block px-4 py-2 text-sm font-medium text-muted hover:bg-background hover:text-foreground"
            >
              Admin login
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
