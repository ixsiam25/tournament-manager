import Link from "next/link";
import { Crest } from "@/components/Crest";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/standings", label: "Standings" },
  { href: "/players", label: "Player Standings" },
  { href: "/teams", label: "Teams" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
        <Link href="/" className="heading-display flex items-center gap-2 text-lg">
          <Crest />
          BFL Season VIII
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-muted">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
