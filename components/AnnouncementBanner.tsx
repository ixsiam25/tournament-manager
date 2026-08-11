import { getAnnouncementSettings } from "@/lib/settings";

/**
 * Site-wide, admin-editable notice (e.g. "Match 12 delayed 10 min") — an
 * `AppSetting`-backed alternative to hardcoding one-off notices into a
 * page's JSX. Rendered directly in the public layout as a server component
 * so it needs no client fetch. Renders nothing when off, empty, or past its
 * optional expiry.
 */
// A plain (non-component) helper so the `Date.now()` call doesn't run
// inside a component body, per React's rule against impure renders.
function isExpired(expiresAt: string | null): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}

export async function AnnouncementBanner() {
  const { enabled, text, level, expiresAt } = await getAnnouncementSettings();
  if (!enabled || !text.trim()) return null;
  if (isExpired(expiresAt)) return null;

  const isWarn = level === "warn";

  return (
    <div
      className={
        "border-b-2 px-5 py-2.5 text-center text-sm font-medium " +
        (isWarn ? "border-live-dark bg-live text-white" : "border-line-strong bg-surface text-foreground")
      }
    >
      {text}
    </div>
  );
}
