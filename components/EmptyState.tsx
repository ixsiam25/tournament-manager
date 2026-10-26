import Link from "next/link";

/** A friendly "nothing here yet" panel, instead of a bare line of grey text. */
export function EmptyState({ icon, title, text, href, cta }: { icon: string; title: string; text?: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-block-lg border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      <p className="text-3xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-2 font-bold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {href && cta && (
        <Link href={href} className="mt-4 inline-block rounded-full bg-foreground px-5 py-2 text-xs font-bold uppercase tracking-wide text-background hover:bg-brand">
          {cta}
        </Link>
      )}
    </div>
  );
}
