"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Crest } from "@/components/Crest";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/fixtures", label: "Fixtures" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return null;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="heading-display flex items-center gap-2 text-lg">
            <Crest size={24} />
            BFL Admin
          </span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-muted">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button onClick={logout} className="text-sm font-medium text-muted hover:text-foreground">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
