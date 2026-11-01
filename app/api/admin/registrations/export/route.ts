import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { batchInfo } from "@/lib/batch";

export const dynamic = "force-dynamic";

/**
 * Backup download: the current season's applications as an Excel file — numbered, grouped by
 * status (approved → pending → rejected) and A–Z within each, with one extra sheet per status.
 * `?status=approved|pending|rejected` downloads just that group. The columns after "No." match
 * the import template, which skips the "No." column, so the same file can be imported back.
 */
const STATUS_ORDER = ["APPROVED", "PENDING", "REJECTED"] as const;
const STATUS_LABEL: Record<(typeof STATUS_ORDER)[number], string> = { APPROVED: "Approved", PENDING: "Pending", REJECTED: "Rejected" };

export async function GET(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ error: "No season yet" }, { status: 404 });
  const config = resolveApplicationConfig(season.applicationConfig);
  const only = request.nextUrl.searchParams.get("status")?.toUpperCase() as (typeof STATUS_ORDER)[number] | undefined;
  if (only && !STATUS_ORDER.includes(only)) return NextResponse.json({ error: "status must be approved, pending or rejected" }, { status: 400 });

  const all = await prisma.registration.findMany({ where: { seasonId: season.id, ...(only ? { status: only } : {}) } });
  // Grouped by status (approved, then pending, then rejected), then A–Z by name.
  const sorted = [...all].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const questions = config.questions ?? [];
  const headers = ["No.", "Name", "Affiliation", "Position", "Contact", "Student ID", "Current semester", "Status", "Source", "Applied on", "Photo", ...questions.map((q) => q.label)];
  const toRows = (list: typeof sorted) =>
    list.map((r, i) => {
      const info = batchInfo(r.affiliation, new Date(), config.batchMeaning);
      const answers = (r.answers ?? {}) as Record<string, string>;
      return [
        i + 1,
        r.name,
        r.affiliation,
        r.position ?? "",
        r.contact,
        r.studentId ?? "",
        info.valid ? info.text : "",
        STATUS_LABEL[r.status as (typeof STATUS_ORDER)[number]],
        r.source,
        r.createdAt.toISOString().slice(0, 16).replace("T", " "),
        r.photoKey ? "yes" : "no",
        ...questions.map((q) => answers[q.id] ?? ""),
      ];
    });
  const sheet = (list: typeof sorted) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...toRows(list)]);
    ws["!cols"] = headers.map((h, i) => ({ wch: i === 0 ? 6 : i === 1 ? 26 : Math.max(12, Math.min(28, h.length + 4)) }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
    return ws;
  };

  const wb = XLSX.utils.book_new();
  // First sheet: everyone, grouped by status and numbered 1…n. Then one numbered sheet per status.
  XLSX.utils.book_append_sheet(wb, sheet(sorted), only ? STATUS_LABEL[only] : "All applicants");
  if (!only) for (const st of STATUS_ORDER) XLSX.utils.book_append_sheet(wb, sheet(sorted.filter((r) => r.status === st)), `${STATUS_LABEL[st]} (${sorted.filter((r) => r.status === st).length})`);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bfl-applicants${only ? `-${only.toLowerCase()}` : ""}-${season.slug}-${date}.xlsx"`,
    },
  });
}
