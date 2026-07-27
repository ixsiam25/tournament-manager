"use client";

import { useRouter } from "next/navigation";
import { Crest } from "@/components/Crest";
import { ThemeToggle } from "@/components/ThemeToggle";

export function ManagerNav({ teamName }: { teamName: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/manager/logout", { method: "POST" });
    router.push("/manager/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
        <span className="heading-display flex items-center gap-2 text-lg">
          <Crest size={24} />
          {teamName} — Manager
        </span>
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
