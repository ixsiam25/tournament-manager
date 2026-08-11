"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
};

export function AuditLogPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (actorFilter) params.set("actor", actorFilter);
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/admin/audit?${params}`);
      const body = await res.json();
      if (!ignore) {
        setEntries(body.entries ?? []);
        setTotal(body.total ?? 0);
        setPageSize(body.pageSize ?? 50);
        setActions(body.actions ?? []);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [page, actorFilter, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="mb-6 heading-display text-2xl">Audit log</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={actorFilter}
          onChange={(e) => {
            setPage(1);
            setActorFilter(e.target.value);
          }}
          placeholder="Filter by actor…"
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        />
        <select
          value={actionFilter}
          onChange={(e) => {
            setPage(1);
            setActionFilter(e.target.value);
          }}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-pitch"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5">
                <div>
                  <span className="font-medium">{e.summary}</span>
                  <span className="ml-2 text-xs text-muted">
                    {e.actorName} · {e.action}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
            {entries.length === 0 && <li className="px-5 py-6 text-center text-muted">No matching entries.</li>}
          </ul>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-full border border-line px-4 py-1.5 font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-muted">
                Page {page} of {totalPages} · {total} total
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-full border border-line px-4 py-1.5 font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
