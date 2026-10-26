import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavMenu } from "@/components/NavMenu";
import { PrimaryNav } from "@/components/PrimaryNav";
import { getActiveSeason, getCurrentSeason } from "@/lib/currentSeason";

export async function PublicHeader() {
  const [activeSeason, currentSeason] = await Promise.all([getActiveSeason(), getCurrentSeason()]);
  const showRegister = !!activeSeason?.registrationSelfServeEnabled && !!activeSeason?.registrationOpen;
  const showAuction = activeSeason?.teamFormation === "AUCTION";
  const primary = [
    ...(activeSeason
      ? [
          { href: "/fixtures", label: "Fixtures" },
          { href: "/standings", label: "Standings" },
          { href: "/teams", label: "Teams" },
          { href: "/cards", label: "Cards" },
        ]
      : []),
    { href: "/legacy", label: "Legacy" },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-line-strong bg-background/92 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-x-4 px-5 py-3.5">
        <Link href="/" prefetch={false} className="heading-display flex min-w-0 items-center gap-2 text-lg text-foreground">
          <BrandLogo />
          <span className="truncate">{currentSeason?.name ?? "Bangladesh Football League"}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          <PrimaryNav items={primary} />
          {showRegister && (
            <Link href="/register" prefetch={false} className="hidden rounded-full bg-pitch px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-pitch-dark sm:inline-block">
              Register
            </Link>
          )}
          <ThemeToggle />
          <NavMenu showRegister={showRegister} showAuction={showAuction} hasActiveSeason={!!activeSeason} />
        </div>
      </div>
    </header>
  );
}
