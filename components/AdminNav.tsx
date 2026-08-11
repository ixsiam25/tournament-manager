"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { UserRole } from "@/lib/generated/prisma/client";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", adminOnly: false },
  { href: "/admin/teams", label: "Teams", adminOnly: true },
  { href: "/admin/players", label: "Players", adminOnly: true },
  { href: "/admin/fixtures", label: "Fixtures", adminOnly: true },
  { href: "/admin/champions", label: "Champions", adminOnly: true },
  { href: "/admin/media", label: "Media", adminOnly: true },
  { href: "/admin/registrations", label: "Registrations", adminOnly: true },
  { href: "/admin/auction", label: "Auction", adminOnly: true },
  { href: "/admin/season/rollover", label: "Season", adminOnly: true },
  { href: "/admin/settings", label: "Settings", adminOnly: true },
  { href: "/admin/users", label: "Users", adminOnly: true },
  { href: "/admin/audit", label: "Audit", adminOnly: true },
  { href: "/admin/security", label: "Security", adminOnly: true },
];

export function AdminNav({ role, name }: { role: UserRole; name: string }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return null;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const items = NAV_ITEMS.filter((item) => role === "ADMIN" || !item.adminOnly);

  return (
    <header className="sticky top-0 z-10 border-b-2 border-black bg-black">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="heading-display flex items-center gap-2 text-lg text-white">
            <BrandLogo size={30} />
            BFL Admin
          </span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-white/60">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={active ? "text-white" : "hover:text-white"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-white/60 sm:inline">{name}</span>
          <ThemeToggle />
          <button onClick={logout} className="text-sm font-medium text-white/60 hover:text-white">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
