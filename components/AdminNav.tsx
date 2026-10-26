"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NAV_GROUPS, activeGroup, activeItemHref } from "@/lib/adminNav";
import type { UserRole } from "@/lib/generated/prisma/client";

/** Two levels: a few big areas on top, and the pages of the current area underneath. */
export function AdminNav({ role, name }: { role: UserRole; name: string }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return null;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const groups = NAV_GROUPS.filter((g) => role === "ADMIN" || !g.adminOnly);
  const current = activeGroup(pathname, groups);
  const subItems = current && current.items.length > 1 ? current.items : [];

  return (
    <header className="sticky top-0 z-10 bg-black">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3">
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/admin" className="heading-display flex shrink-0 items-center gap-2 text-lg text-white">
            <BrandLogo size={28} />
            <span className="hidden sm:inline">BFL Admin</span>
          </Link>
          <nav aria-label="Main" className="flex min-w-0 gap-1 overflow-x-auto text-sm font-medium">
            {groups.map((g) => {
              const active = current?.key === g.key;
              return (
                <Link
                  key={g.key}
                  href={g.items[0].href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={"whitespace-nowrap rounded-full px-3.5 py-1.5 " + (active ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white")}
                >
                  {g.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-sm text-white/60 lg:inline">{name}</span>
          <ThemeToggle />
          <button onClick={logout} className="text-sm font-medium text-white/60 hover:text-white">
            Log out
          </button>
        </div>
      </div>
      {subItems.length > 0 && (
        <div className="border-t border-white/10 bg-white/5">
          <nav aria-label={current?.label} className="mx-auto flex max-w-4xl gap-5 overflow-x-auto px-5 py-2 text-sm">
            {subItems.map((item) => {
              const active = activeItemHref(pathname, subItems) === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  title={item.hint}
                  aria-current={active ? "page" : undefined}
                  className={"whitespace-nowrap border-b-2 pb-1 " + (active ? "border-white font-bold text-white" : "border-transparent text-white/60 hover:text-white")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
