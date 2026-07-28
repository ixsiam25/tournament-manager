const VOTER_ID_KEY = "bfl_voter_id";
const VOTER_NAME_KEY = "bfl_voter_name";
const VOTER_SEMESTER_KEY = "bfl_voter_semester";

/** A stable per-browser id so a visitor's prediction can be found again and
 * changed, without any real account system. Purely a dedupe key — never
 * treated as an identity. */
export function getVoterId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VOTER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_ID_KEY, id);
  }
  return id;
}

// name/semester are read via useSyncExternalStore (see VoterIdentityForm),
// so writes need to announce themselves the same way ThemeToggle's dark-mode
// flag does — otherwise the input showing them would need an effect+setState
// to notice a change, which is exactly what useSyncExternalStore avoids.
const listeners = new Set<() => void>();

export function subscribeVoterIdentity(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getVoterName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(VOTER_NAME_KEY) ?? "";
}

export function setVoterName(name: string): void {
  if (typeof window === "undefined") return;
  if (name) localStorage.setItem(VOTER_NAME_KEY, name);
  else localStorage.removeItem(VOTER_NAME_KEY);
  listeners.forEach((listener) => listener());
}

export function getVoterSemester(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(VOTER_SEMESTER_KEY) ?? "";
}

export function setVoterSemester(semester: string): void {
  if (typeof window === "undefined") return;
  if (semester) localStorage.setItem(VOTER_SEMESTER_KEY, semester);
  else localStorage.removeItem(VOTER_SEMESTER_KEY);
  listeners.forEach((listener) => listener());
}
