"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side redirect for pages that only the ADMIN role should reach
 * (team/player/fixture CRUD, champions, settings). This is a UX nicety, not
 * the security boundary — the actual enforcement is server-side per API
 * route via `requireUser(["ADMIN"])`; a SCORER hitting one of these pages
 * would get 401s from every fetch regardless. This just avoids showing a
 * SCORER a page full of broken requests and bounces them back to the
 * dashboard instead.
 */
export function useRequireAdminRole() {
  const router = useRouter();

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/admin/me");
      if (ignore) return;
      if (!res.ok) {
        router.push("/admin/login");
        return;
      }
      const body = await res.json();
      if (body.role !== "ADMIN") {
        router.push("/admin");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [router]);
}
