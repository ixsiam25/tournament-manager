import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/userAuth";
import { logAudit } from "@/lib/audit";
import { announcementSettingsSchema } from "@/lib/validation";
import { getAnnouncementSettings, setAnnouncementSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;

  const settings = await getAnnouncementSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const result = await requireUser(["ADMIN"]);
  if (result instanceof NextResponse) return result;
  const { user: actor } = result;

  const body = await request.json().catch(() => null);
  const parsed = announcementSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  await setAnnouncementSettings(parsed.data);
  await logAudit({
    actor,
    action: "announcement.update",
    entityType: "AppSetting",
    summary: "Updated the site announcement banner",
    after: parsed.data,
  });

  const settings = await getAnnouncementSettings();
  return NextResponse.json({ settings });
}
