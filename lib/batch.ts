import { ordinalSemester } from "@/lib/semester";

/**
 * Graduation-batch labels like "Fall 27" / "Spring 24", and what they mean
 * today. Pure and dependency-light so the apply form (browser), the server and
 * the formation tools all agree.
 *
 * A batch is named by the term it GRADUATES in (the label meaning is
 * configurable per season — see `BatchMeaning`; "entry" names the term it started). Terms follow the APU calendar: the Spring
 * term runs April–August and the Fall term September–March, so a batch's
 * semester number is simply how many terms have started since its own. After
 * `MAX_SEMESTERS` (8 = four years) the batch counts as alumni; a batch whose
 * first term hasn't started yet is "incoming".
 */
export type Term = "SPRING" | "FALL";
export type BatchMeaning = "entry" | "graduation";
export const MAX_SEMESTERS = 8;

export type TermYear = { term: Term; year: number };

/** Monotonic index: Spring(Y) < Fall(Y) < Spring(Y+1). */
const termIndex = (t: TermYear) => t.year * 2 + (t.term === "FALL" ? 1 : 0);

/** The term in progress on a given date (Jan–Mar belongs to the Fall term that began the previous September). */
export function termOfDate(date: Date): TermYear {
  const m = date.getMonth(); // 0 = Jan
  if (m >= 3 && m <= 7) return { term: "SPRING", year: date.getFullYear() };
  return { term: "FALL", year: m >= 8 ? date.getFullYear() : date.getFullYear() - 1 };
}

const TERM_WORDS: Record<string, Term> = { spring: "SPRING", s: "SPRING", sp: "SPRING", fall: "FALL", autumn: "FALL", f: "FALL" };

/** Understands "Fall 24", "fall'24", "Spring2025", "24 Fall", "F24", "2024 Spring". Returns null for anything else. */
export function parseBatch(raw: string | null | undefined): TermYear | null {
  const text = raw?.trim().toLowerCase().replace(/[’'`-]/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  const m = text.match(/^(spring|fall|autumn|sp|s|f)\s*(\d{2}|\d{4})$/) ?? text.match(/^(\d{2}|\d{4})\s*(spring|fall|autumn|sp|s|f)$/);
  if (!m) return null;
  const [word, digits] = isNaN(Number(m[1])) ? [m[1], m[2]] : [m[2], m[1]];
  const term = TERM_WORDS[word];
  const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits);
  if (!term || year < 2000 || year > 2099) return null;
  return { term, year };
}

/** "Fall 24" — the one spelling stored everywhere. */
export function formatBatch(t: TermYear): string {
  return `${t.term === "FALL" ? "Fall" : "Spring"} ${String(t.year % 100).padStart(2, "0")}`;
}

export type BatchInfo =
  | { valid: false }
  | {
      valid: true;
      /** Canonical label, e.g. "Fall 24". */
      label: string;
      status: "student" | "alumni" | "incoming";
      /** 1…8 for current students, null otherwise. */
      semester: number | null;
      /** Human text: "5th semester", "Alumni", "Starts Fall 2027". */
      text: string;
    };

/**
 * What a batch label means on `onDate`. By default the label is the term the batch
 * graduates in, so its first term was seven terms earlier ("entry": the label is
 * the first term itself).
 */
export function batchInfo(label: string | null | undefined, onDate: Date = new Date(), meaning: BatchMeaning = "graduation"): BatchInfo {
  const parsed = parseBatch(label);
  if (!parsed) return { valid: false };
  const entryIndex = termIndex(parsed) - (meaning === "graduation" ? MAX_SEMESTERS - 1 : 0);
  const semester = termIndex(termOfDate(onDate)) - entryIndex + 1;
  const canonical = formatBatch(parsed);
  if (semester < 1) {
    const entry = { term: (entryIndex % 2 === 1 ? "FALL" : "SPRING") as Term, year: Math.floor(entryIndex / 2) };
    return { valid: true, label: canonical, status: "incoming", semester: null, text: `Starts ${entry.term === "FALL" ? "Fall" : "Spring"} ${entry.year}` };
  }
  if (semester > MAX_SEMESTERS) return { valid: true, label: canonical, status: "alumni", semester: null, text: "Alumni" };
  return { valid: true, label: canonical, status: "student", semester, text: `${ordinalSemester(semester)} semester` };
}

/**
 * The label of the batch that is in its `semester`-th semester on `onDate` —
 * the inverse of `batchInfo`. Used to build realistic demo/test data that stays
 * correct whatever day it is run (`semester` 1…8; 9 and above are alumni).
 */
export function batchLabelForSemester(semester: number, onDate: Date = new Date(), meaning: BatchMeaning = "graduation"): string {
  const entryIndex = termIndex(termOfDate(onDate)) - (semester - 1);
  const labelIndex = entryIndex + (meaning === "graduation" ? MAX_SEMESTERS - 1 : 0);
  return formatBatch({ term: labelIndex % 2 === 1 ? "FALL" : "SPRING", year: Math.floor(labelIndex / 2) });
}
