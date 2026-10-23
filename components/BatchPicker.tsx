"use client";

import { useMemo, useState } from "react";
import { batchInfo, formatBatch, parseBatch, type BatchMeaning, type Term } from "@/lib/batch";

const SELECT = "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch";

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
}: {
  value: string;
  onChange: (label: string) => void;
  required: boolean;
  meaning: BatchMeaning;
}) {
  // The two dropdowns keep their own state: until both are chosen the reported
  // value is "" and could not remember a half-made choice by itself.
  const initial = parseBatch(value);
  const [term, setTerm] = useState<Term | "">(initial?.term ?? "");
  const [year, setYear] = useState<number | "">(initial?.year ?? "");
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const top = meaning === "graduation" ? thisYear + 5 : thisYear;
    return Array.from({ length: top - (thisYear - 12) + 1 }, (_, i) => top - i);
  }, [meaning, thisYear]);

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
