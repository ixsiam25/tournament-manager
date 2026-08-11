import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

const HEADERS = ["Name", "Affiliation", "Position", "Contact"];

/** Downloads the fixed-shape import template — see
 * `app/api/admin/registrations/import/route.ts` for the matching parser.
 * Position is free text here but only GK/DEF/MID/FWD (case-insensitive)
 * import cleanly; anything else comes in as unset. */
export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ["Jane Doe", "5th Semester", "MID", "090-1234-5678"]]);
  ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "Registrations");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=registration-template.xlsx",
    },
  });
}
