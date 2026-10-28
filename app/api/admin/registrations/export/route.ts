import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { getCurrentSeason } from "@/lib/currentSeason";
import { resolveApplicationConfig } from "@/lib/applicationConfig";
import { batchInfo } from "@/lib/batch";

export const dynamic = "force-dynamic";

/**
 * Backup download: every application of the current season as an Excel file. The first five
 * columns match the import template (Name, Affiliation, Position, Contact, Student ID), so the
 * same file can be imported back; the extra columns are for reference.
 */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ error: "No season yet" }, { status: 404 });
  const config = resolveApplicationConfig(season.applicationConfig);
  const registrations = await prisma.registration.findMany({ where: { seasonId: season.id }, orderBy: { createdAt: "asc" } });

  const questions = config.questions ?? [];
  const headers = ["Name", "Affiliation", "Position", "Contact", "Student ID", "Current semester", "Status", "Source", "Applied on", "Photo", ...questions.map((q) => q.label)];
  const rows = registrations.map((r) => {
    const info = batchInfo(r.affiliation, new Date(), config.batchMeaning);
    const answers = (r.answers ?? {}) as Record<string, string>;
    return [
      r.name,
      r.affiliation,
      r.position ?? "",
      r.contact,
      r.studentId ?? "",
      info.valid ? info.text : "",
      r.status,
      r.source,
      r.createdAt.toISOString().slice(0, 16).replace("T", " "),
      r.photoKey ? "yes" : "no",
      ...questions.map((q) => answers[q.id] ?? ""),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map((h, i) => ({ wch: i === 0 ? 26 : Math.max(12, Math.min(28, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Applicants");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bfl-applicants-${season.slug}-${date}.xlsx"`,
    },
  });
}
