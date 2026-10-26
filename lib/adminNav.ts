/** The admin console's menu, grouped by what the organiser is trying to do. */
export type NavItem = { href: string; label: string; hint: string };
export type NavGroup = { key: string; label: string; adminOnly: boolean; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { key: "home", label: "Home", adminOnly: false, items: [{ href: "/admin", label: "Home", hint: "What to do next" }] },
  {
    key: "season",
    label: "Season",
    adminOnly: true,
    items: [
      { href: "/admin/season", label: "Setup guide", hint: "Step-by-step from a new season to matchday" },
      { href: "/admin/registrations", label: "Applications", hint: "Review and approve players who applied" },
      { href: "/admin/formation", label: "Team formation", hint: "Choose how teams are formed and place players" },
      { href: "/admin/auction", label: "Auction", hint: "Run the live player auction" },
      { href: "/admin/season/teams", label: "Teams", hint: "Names, logos, captains and managers" },
      { href: "/admin/season/details", label: "Season details", hint: "Name, squad size, match format, pitches" },
      { href: "/admin/settings", label: "Application form", hint: "Which questions the sign-up form asks" },
    ],
  },
  {
    key: "players",
    label: "Players",
    adminOnly: true,
    items: [
      { href: "/admin/players", label: "Players", hint: "Rosters, releases and transfers" },
      { href: "/admin/people", label: "People", hint: "Everyone who has ever played, across seasons" },
      { href: "/admin/cards", label: "Player cards", hint: "Ratings and the public card gallery" },
    ],
  },
  {
    key: "matches",
    label: "Matches",
    adminOnly: true,
    items: [
      { href: "/admin/fixtures", label: "Fixtures", hint: "Schedule and edit matches" },
      { href: "/admin/champions", label: "Champions", hint: "Prediction results and winners" },
    ],
  },
  { key: "website", label: "Website", adminOnly: true, items: [{ href: "/admin/media", label: "Photos & media", hint: "Uploaded images and files" }] },
  {
    key: "access",
    label: "Access",
    adminOnly: true,
    items: [
      { href: "/admin/users", label: "Users", hint: "Who can log in and what they can do" },
      { href: "/admin/audit", label: "Activity log", hint: "Who changed what, and when" },
      { href: "/admin/security", label: "Security", hint: "Password and sign-in settings" },
    ],
  },
];

/** The group a page belongs to: the longest matching item path wins. */
export function activeGroup(pathname: string, groups: NavGroup[]): NavGroup | null {
  let best: { g: NavGroup; len: number } | null = null;
  for (const g of groups) {
    for (const item of g.items) {
      const match = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(item.href + "/");
      if (match && (!best || item.href.length > best.len)) best = { g, len: item.href.length };
    }
  }
  return best?.g ?? null;
}

/** The menu item of `items` that the current page belongs to (longest path wins). */
export function activeItemHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const match = pathname === href || pathname.startsWith(href + "/");
    if (match && (!best || href.length > best.length)) best = href;
  }
  return best;
}
