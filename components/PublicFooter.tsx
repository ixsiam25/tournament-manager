import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { getCurrentSeason } from "@/lib/currentSeason";

export async function PublicFooter() {
  const season = await getCurrentSeason();
  const links = [
    { href: "/standings", label: "Standings" },
    { href: "/fixtures", label: "Fixtures" },
    { href: "/cards", label: "Cards" },
    { href: "/legacy", label: "Legacy" },
    { href: "/legacy/hall-of-fame", label: "Hall of Fame" },
  ];
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <BrandLogo size={28} />
          <div>
            <p className="font-bold text-foreground">Bangladesh Football League</p>
            <p className="text-xs">{season ? `${season.name} · by and for the community` : "By and for the community"}</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} prefetch={false} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
          <Link href="/manager/login" prefetch={false} className="hover:text-foreground">
            Manager login
          </Link>
        </nav>
      </div>
    </footer>
  );
}
