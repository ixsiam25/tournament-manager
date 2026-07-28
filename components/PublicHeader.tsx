import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavMenu } from "@/components/NavMenu";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-10 border-b-2 border-black bg-black">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
        <Link href="/" prefetch={false} className="heading-display flex items-center gap-2 text-lg text-white">
          <BrandLogo />
          BFL Season IX
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <NavMenu />
        </div>
      </div>
    </header>
  );
}
