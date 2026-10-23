import { randomUUID } from "node:crypto";
import type { Season } from "@/lib/generated/prisma/client";
import {
  clampFraming,
  validateApplication,
  type ApplicationConfig,
  type Framing,
} from "@/lib/applicationConfig";
import { normalizeStudentId } from "@/lib/identity";
import { putObject } from "@/lib/mediaStore";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_CUTOUT_BYTES = 3 * 1024 * 1024;

/** Applications accept submissions only while the season switch is on AND the
 * optional deadline hasn't passed. */
export function isApplicationOpen(season: Pick<Season, "registrationSelfServeEnabled" | "registrationOpen" | "applicationDeadline">, now = new Date()): boolean {
  if (!season.registrationSelfServeEnabled || !season.registrationOpen) return false;
  return !season.applicationDeadline || now < season.applicationDeadline;
}

export type ParsedApplication = {
  name: string;
  studentId: string | null;
  affiliation: string;
  contact: string;
  position: "GK" | "DEF" | "MID" | "FWD" | null;
  answers: Record<string, string>;
  framing: Framing;
  photo: File | null;
  /** Background-removed PNG produced in the applicant's browser. */
  cutout: File | null;
  removePhoto: boolean;
};

/** Reads + validates the multipart form shared by "apply" and "edit my
 * application". `existingPhoto` tells the validator a photo already exists
 * (so a required photo isn't demanded again on edit). */
export function parseApplicationForm(
  formData: FormData,
  config: ApplicationConfig,
  existingPhoto = false,
  now: Date = new Date(),
): { ok: true; value: ParsedApplication } | { ok: false; error: string } {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };

  let answers: Record<string, string> = {};
  const rawAnswers = str("answers");
  if (rawAnswers) {
    try {
      const parsed = JSON.parse(rawAnswers);
      if (parsed && typeof parsed === "object") {
        answers = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
      }
    } catch {
      return { ok: false, error: "Couldn't read the answers" };
    }
  }

  const file = formData.get("photo");
  const photo = file instanceof File && file.size > 0 ? file : null;
  const removePhoto = str("removePhoto") === "1";
  const cutoutFile = formData.get("cutout");
  const cutout = cutoutFile instanceof File && cutoutFile.size > 0 ? cutoutFile : null;
  if (cutout) {
    if (cutout.type !== "image/png") return { ok: false, error: "The card cut-out must be a PNG" };
    if (cutout.size > MAX_CUTOUT_BYTES) return { ok: false, error: "The card cut-out is too large" };
    if (!photo) return { ok: false, error: "A cut-out needs its photo" };
  }
  if (photo) {
    if (!ALLOWED_PHOTO_TYPES.has(photo.type)) return { ok: false, error: "Photo must be JPEG, PNG, or WebP" };
    if (photo.size > MAX_PHOTO_BYTES) return { ok: false, error: "Photo is too large" };
  }

  const checked = validateApplication(config, {
    name: str("name") ?? "",
    studentId: str("studentId"),
    affiliation: str("affiliation"),
    position: str("position"),
    contact: str("contact"),
    answers,
    hasPhoto: !!photo || (existingPhoto && !removePhoto),
  }, now);
  if (!checked.ok) return checked;

  return {
    ok: true,
    value: {
      name: checked.data.name,
      studentId: normalizeStudentId(checked.data.studentId),
      affiliation: checked.data.affiliation ?? "",
      contact: checked.data.contact ?? "",
      position: checked.data.position as ParsedApplication["position"],
      answers: checked.data.answers,
      framing: clampFraming({ photoZoom: str("photoZoom"), photoX: str("photoX"), photoY: str("photoY") }),
      photo,
      cutout,
      removePhoto,
    },
  };
}

/** Stores an applicant photo under a fresh random key (immutable URLs). */
export async function storeApplicantPhoto(file: File): Promise<string> {
  const key = `registration-${randomUUID()}`;
  await putObject(key, await file.arrayBuffer(), file.type);
  return key;
}

/** Stores the background-removed PNG. Checks the PNG signature so an arbitrary
 * file can't be smuggled in under a PNG content type. */
export async function storeApplicantCutout(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => bytes[i] === b)) throw new Error("not a PNG");
  const key = `registration-cutout-${randomUUID()}`;
  await putObject(key, bytes, "image/png");
  return key;
}
