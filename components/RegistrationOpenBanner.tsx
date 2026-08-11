import Link from "next/link";

export function RegistrationOpenBanner({ seasonName }: { seasonName: string }) {
  return (
    <Link
      href="/register"
      className="animate-card-in mb-8 flex flex-wrap items-center justify-between gap-4 rounded-block-lg border-2 border-pitch bg-pitch/10 px-6 py-5 shadow-block transition-transform hover:-translate-y-0.5"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-pitch-dark">📝 Registration Open</p>
        <p className="heading-display mt-1 text-xl sm:text-2xl">Join {seasonName}</p>
      </div>
      <span className="shrink-0 rounded-block border-2 border-line-strong bg-background px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-block">
        Register →
      </span>
    </Link>
  );
}
