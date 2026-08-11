import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const EXPECTED_HEADERS = ["name", "affiliation", "position", "contact"];
const VALID_POSITIONS = new Set(["GK", "DEF", "MID", "FWD"]);

/** Parses a workbook matching the fixed template from
 * `app/api/admin/registrations/template/route.ts` into a batch of PENDING
 * registrations. Rejects anything that doesn't match the expected header
 * row exactly — fixed template, not flexible column-mapping, confirmed
 * simpler and reliable enough at this scale. */
export async function POST(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
  if (!season) return NextResponse.json({ error: "No active season" }, { status: 409 });
  if (!season.registrationExcelImportEnabled) {
    return NextResponse.json({ error: "Excel import isn't enabled for this season" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let rows: unknown[][];
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
  } catch {
    return NextResponse.json({ error: "Couldn't read that file — is it a valid .xlsx?" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "That file has no rows" }, { status: 400 });
  }
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const headerMatches = EXPECTED_HEADERS.every((h, i) => header[i] === h);
  if (!headerMatches) {
    return NextResponse.json(
      { error: `Columns must be exactly: ${EXPECTED_HEADERS.map((h) => h[0].toUpperCase() + h.slice(1)).join(", ")} — download the template and use it as-is.` },
      { status: 400 },
    );
  }

  const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));
  if (dataRows.length === 0) {
    return NextResponse.json({ error: "No data rows found below the header" }, { status: 400 });
  }

  const toCreate = dataRows.map((r) => {
    const [name, affiliation, positionRaw, contact] = r.map((c) => String(c ?? "").trim());
    const positionUpper = positionRaw.toUpperCase();
    return {
      seasonId: season.id,
      name,
      affiliation,
      position: VALID_POSITIONS.has(positionUpper) ? (positionUpper as "GK" | "DEF" | "MID" | "FWD") : null,
      contact,
      source: "EXCEL_IMPORT" as const,
      status: "PENDING" as const,
    };
  });

  const missingName = toCreate.filter((r) => !r.name).length;
  if (missingName > 0) {
    return NextResponse.json({ error: `${missingName} row(s) are missing a name` }, { status: 400 });
  }

  const created = await prisma.registration.createMany({ data: toCreate });
  await logAudit({
    actor,
    action: "registration.import",
    entityType: "Registration",
    summary: `Imported ${created.count} registration(s) from Excel`,
  });

  return NextResponse.json({ count: created.count }, { status: 201 });
}
