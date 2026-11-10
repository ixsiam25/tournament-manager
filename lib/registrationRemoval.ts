/** Applications taken out of the season by an admin are REJECTED with a note that starts with this. */
export const REMOVED_PREFIX = "Removed by admin";
export const wasRemovedByAdmin = (r: { status: string; notes?: string | null }) => r.status === "REJECTED" && !!r.notes?.startsWith(REMOVED_PREFIX);
