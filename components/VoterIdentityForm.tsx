"use client";

import { useSyncExternalStore } from "react";
import {
  getVoterName,
  getVoterSemester,
  setVoterName,
  setVoterSemester,
  subscribeVoterIdentity,
} from "@/lib/voterIdentity";

function getServerSnapshot() {
  return "";
}

export function VoterIdentityForm() {
  const name = useSyncExternalStore(subscribeVoterIdentity, getVoterName, getServerSnapshot);
  const semester = useSyncExternalStore(subscribeVoterIdentity, getVoterSemester, getServerSnapshot);

  return (
    <div className="mb-6 rounded-block-lg border-2 border-line-strong bg-surface p-4 shadow-block">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
        Who&rsquo;s voting? <span className="font-normal normal-case">(optional)</span>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setVoterName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-block border-2 border-line bg-background px-3 py-2 text-sm sm:flex-1"
        />
        <input
          value={semester}
          onChange={(e) => setVoterSemester(e.target.value)}
          placeholder="Semester"
          className="w-full rounded-block border-2 border-line bg-background px-3 py-2 text-sm sm:w-40"
        />
      </div>
    </div>
  );
}
