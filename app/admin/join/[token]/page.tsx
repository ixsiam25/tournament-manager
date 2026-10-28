import type { Metadata } from "next";
import { AdminJoinForm } from "@/components/AdminJoinForm";
import { BrandLogo } from "@/components/BrandLogo";
import { findInvite } from "@/lib/adminInvites";

export const dynamic = "force-dynamic";
// The token is a credential: keep this page out of search indexes.
export const metadata: Metadata = { title: "Join the admin team", robots: { index: false, follow: false } };

const MESSAGES = {
  used: "This invitation has already been used.",
  revoked: "This invitation was cancelled.",
  expired: "This invitation has expired.",
  unknown: "This invitation link isn’t valid.",
} as const;

export default async function AdminJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { invite, state } = await findInvite(token);
  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <div className="mb-6 flex items-center gap-3">
        <BrandLogo size={44} />
        <h1 className="heading-display text-2xl">Join the BFL team</h1>
      </div>
      {invite && state === "valid" ? (
        <AdminJoinForm token={token} role={invite.role} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center" data-testid="join-invalid">
          <p className="font-bold">{MESSAGES[state as keyof typeof MESSAGES] ?? MESSAGES.unknown}</p>
          <p className="mt-1 text-sm text-muted-foreground">Ask the admin who invited you for a new link.</p>
        </div>
      )}
    </main>
  );
}
