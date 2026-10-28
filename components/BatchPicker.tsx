"use client";

import { useMemo, useState } from "react";
import { batchInfo, batchLabelForSemester, formatBatch, MAX_SEMESTERS, parseBatch, type BatchMeaning, type Term } from "@/lib/batch";
import { ordinalSemester } from "@/lib/semester";

const SELECT = "min-w-0 flex-1 rounded-xl border border-line bg-background px-4 py-3 text-base outline-none transition focus:border-pitch focus:ring-4 focus:ring-pitch/15";

/**
 * Picks an intake batch ("Fall 24") from two dropdowns and says, as you choose,
 * what it means today — "5th semester" or "Alumni" — so nobody has to work out
 * (or mistype) their own semester. The value it reports is the canonical label,
 * or "" until both parts are chosen.
 */
export function BatchPicker({
  value,
  onChange,
  required,
  meaning,
  mode = "term",
}: {
  value: string;
  onChange: (label: string) => void;
  required: boolean;
  meaning: BatchMeaning;
  /** "semester": the applicant says which semester they are in and the batch is worked out; "term": pick the batch directly (admin). */
  mode?: "term" | "semester";
}) {
  return mode === "semester" ? <SemesterPicker value={value} onChange={onChange} required={required} meaning={meaning} /> : <TermPicker value={value} onChange={onChange} required={required} meaning={meaning} />;
}

/**
 * Applicants say which semester they are in right now (1st–8th, or alumni) and the
 * batch they belong to is worked out from the calendar — nobody has to know their
 * own graduation term. Alumni say which batch they were in.
 */
function SemesterPicker({ value, onChange, required, meaning }: { value: string; onChange: (label: string) => void; required: boolean; meaning: BatchMeaning }) {
  const existing = value ? batchInfo(value, new Date(), meaning) : null;
  const [choice, setChoice] = useState<string>(existing?.valid ? (existing.status === "alumni" ? "alumni" : existing.semester ? String(existing.semester) : "") : "");

  function pick(next: string) {
    setChoice(next);
    if (next === "") onChange("");
    else if (next === "alumni") onChange(""); // the batch is chosen below
    else onChange(batchLabelForSemester(Number(next), new Date(), meaning));
  }

  const info = value ? batchInfo(value, new Date(), meaning) : null;
  return (
    <div>
      <select aria-label="Current semester" value={choice} required={required} onChange={(e) => pick(e.target.value)} className={SELECT + " w-full"}>
        <option value="">Choose your current semester…</option>
        {Array.from({ length: MAX_SEMESTERS }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {ordinalSemester(n)} semester
          </option>
        ))}
        <option value="alumni">Alumni — already graduated</option>
      </select>
      {choice === "alumni" && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-muted-foreground">Which batch were you in?</p>
          <TermPicker value={value} onChange={onChange} required={required} meaning={meaning} past />
        </div>
      )}
      {choice !== "" && choice !== "alumni" && info?.valid && (
        <p className="mt-1.5 text-sm font-medium text-pitch" data-testid="batch-status">
          You&rsquo;ll be in the {info.label} batch — {info.text}
        </p>
      )}
    </div>
  );
}

function TermPicker({ value, onChange, required, meaning, past = false }: { value: string; onChange: (label: string) => void; required: boolean; meaning: BatchMeaning; past?: boolean }) {
  // The two dropdowns keep their own state: until both are chosen the reported
  // value is "" and could not remember a half-made choice by itself.
  const initial = parseBatch(value);
  const [term, setTerm] = useState<Term | "">(initial?.term ?? "");
  const [year, setYear] = useState<number | "">(initial?.year ?? "");
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const top = past ? thisYear : meaning === "graduation" ? thisYear + 5 : thisYear;
    return Array.from({ length: top - (thisYear - 12) + 1 }, (_, i) => top - i);
  }, [meaning, thisYear, past]);

  function change(nextTerm: Term | "", nextYear: number | "") {
    setTerm(nextTerm);
    setYear(nextYear);
    onChange(nextTerm && nextYear ? formatBatch({ term: nextTerm, year: nextYear }) : "");
  }

  const info = value ? batchInfo(value, new Date(), meaning) : null;

  return (
    <div>
      <div className="flex gap-2">
        <select
          aria-label="Batch term"
          value={term}
          required={required}
          onChange={(e) => change(e.target.value as Term | "", year)}
          className={SELECT}
        >
          <option value="">Fall or Spring…</option>
          <option value="FALL">Fall</option>
          <option value="SPRING">Spring</option>
        </select>
        <select
          aria-label="Batch year"
          value={year}
          required={required}
          onChange={(e) => change(term, e.target.value === "" ? "" : Number(e.target.value))}
          className={SELECT}
        >
          <option value="">Year…</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {info?.valid && (
        <p className={"mt-1 text-sm " + (info.status === "incoming" ? "text-live" : "font-medium text-pitch")} data-testid="batch-status">
          {info.label} — {info.status === "incoming" ? `${info.text}. Check the year.` : info.text}
        </p>
      )}
    </div>
  );
}
