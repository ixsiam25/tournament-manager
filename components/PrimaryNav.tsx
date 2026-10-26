"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The handful of pages most visitors want, always visible on wide screens. */
export function PrimaryNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={"rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors " + (active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
