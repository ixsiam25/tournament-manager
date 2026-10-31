import { z } from "zod";
import { batchInfo, parseBatch, formatBatch, type BatchMeaning } from "@/lib/batch";

/**
 * What the public apply form asks for, per season. Pure (no server imports):
 * the form, the API and the admin editor all share these rules so what the
 * applicant sees is exactly what the server enforces.
 *
 * Always asked, never configurable: the applicant's name. Everything else can
 * be switched off or made optional; organisers can add a few custom questions.
 */
export type FieldKey = "studentId" | "affiliation" | "position" | "contact" | "photo";
export type FieldRule = { enabled: boolean; required: boolean };
export type Question = {
  id: string;
  label: string;
  kind: "text" | "choice";
  options?: string[];
  required: boolean;
};
export type ApplicationConfig = {
  fields: Record<FieldKey, FieldRule>;
  questions: Question[];
  /** Shown above the form, e.g. rules or a deadline reminder. */
  intro: string;
  /** "batch": the affiliation is an intake like "Fall 24" and the system works out
   * the current semester (or alumni) itself; "text": free text. */
  affiliationKind: "text" | "batch";
  /** What a batch label names: the term the batch graduates ("graduation", the default) or started ("entry"). */
  batchMeaning: BatchMeaning;
  /** Most applications the public form accepts (pending + approved); null = no limit. Admins can still add people by hand. */
  maxApplications: number | null;
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  studentId: "Student ID",
  affiliation: "Affiliation",
  position: "Preferred position",
  contact: "Contact",
  photo: "Photo",
};

export const DEFAULT_APPLICATION_CONFIG: ApplicationConfig = {
  fields: {
    studentId: { enabled: true, required: true },
    affiliation: { enabled: true, required: true },
    position: { enabled: true, required: false },
    contact: { enabled: true, required: true },
    photo: { enabled: true, required: false },
  },
  questions: [],
  intro: "",
  affiliationKind: "batch",
  batchMeaning: "graduation",
  maxApplications: null,
};

export const MAX_QUESTIONS = 6;

const ruleSchema = z.object({ enabled: z.boolean(), required: z.boolean() });
const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/, "Question ids are lowercase letters, digits or _"),
  label: z.string().trim().min(1, "Every question needs a label").max(120),
  kind: z.enum(["text", "choice"]),
  options: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  required: z.boolean(),
});

/** Strict schema for the admin editor (rejects anything unexpected). */
export const applicationConfigSchema = z
  .object({
    fields: z.object({
      studentId: ruleSchema,
      affiliation: ruleSchema,
      position: ruleSchema,
      contact: ruleSchema,
      photo: ruleSchema,
    }),
    questions: z.array(questionSchema).max(MAX_QUESTIONS, `At most ${MAX_QUESTIONS} custom questions`),
    intro: z.string().trim().max(600),
    affiliationKind: z.enum(["text", "batch"]).default("batch"),
    batchMeaning: z.enum(["entry", "graduation"]).default("graduation"),
    maxApplications: z.number().int("Use a whole number").min(1, "The limit must be at least 1").max(5000).nullable().default(null),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    cfg.questions.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: "custom", message: `Duplicate question id "${q.id}"`, path: ["questions", i, "id"] });
      ids.add(q.id);
      if (q.kind === "choice" && (!q.options || q.options.length < 2)) {
        ctx.addIssue({ code: "custom", message: `"${q.label}" needs at least two options`, path: ["questions", i, "options"] });
      }
    });
    for (const key of Object.keys(cfg.fields) as FieldKey[]) {
      if (!cfg.fields[key].enabled && cfg.fields[key].required) {
        ctx.addIssue({ code: "custom", message: `${FIELD_LABELS[key]} can't be required while switched off`, path: ["fields", key] });
      }
    }
  });

/** Tolerant read of whatever is stored: unknown/missing parts fall back to defaults. */
export function resolveApplicationConfig(raw: unknown): ApplicationConfig {
  const parsed = applicationConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data as ApplicationConfig;
  return DEFAULT_APPLICATION_CONFIG;
}

export const PHOTO_ZOOM_RANGE = { min: 60, max: 220 } as const;
export const PHOTO_OFFSET_RANGE = { min: -60, max: 60 } as const;

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export type Framing = { photoZoom: number; photoX: number; photoY: number };
export function clampFraming(input: { photoZoom?: unknown; photoX?: unknown; photoY?: unknown }): Framing {
  return {
    photoZoom: clampInt(input.photoZoom, PHOTO_ZOOM_RANGE.min, PHOTO_ZOOM_RANGE.max, 100),
    photoX: clampInt(input.photoX, PHOTO_OFFSET_RANGE.min, PHOTO_OFFSET_RANGE.max, 0),
    photoY: clampInt(input.photoY, PHOTO_OFFSET_RANGE.min, PHOTO_OFFSET_RANGE.max, 0),
  };
}

export type ApplicationInput = {
  name: string;
  studentId: string | null;
  affiliation: string | null;
  position: string | null;
  contact: string | null;
  answers: Record<string, string>;
  hasPhoto: boolean;
};

const POSITIONS = new Set(["GK", "DEF", "MID", "FWD"]);

/**
 * Checks an application against the season's config. Returns the cleaned
 * values (disabled fields are dropped, answers limited to known questions) or
 * the first human-readable problem.
 */
export function validateApplication(
  config: ApplicationConfig,
  input: ApplicationInput,
  now: Date = new Date(),
): { ok: true; data: Omit<ApplicationInput, "hasPhoto"> } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required" };
  if (name.length > 60) return { ok: false, error: "Name is too long" };

  const text = (key: FieldKey, value: string | null, max: number) => {
    const rule = config.fields[key];
    if (!rule.enabled) return { value: null as string | null };
    const v = value?.trim() ?? "";
    if (!v) return rule.required ? { error: `${FIELD_LABELS[key]} is required` } : { value: null as string | null };
    if (v.length > max) return { error: `${FIELD_LABELS[key]} is too long` };
    return { value: v };
  };

  const studentId = text("studentId", input.studentId, 40);
  let affiliation = text("affiliation", input.affiliation, 80);
  if (config.affiliationKind === "batch" && "value" in affiliation && affiliation.value) {
    const parsed = parseBatch(affiliation.value);
    if (!parsed) return { ok: false, error: "Enter your batch like “Fall 24” or “Spring 25”" };
    const info = batchInfo(formatBatch(parsed), now, config.batchMeaning);
    if (info.valid && info.status === "incoming") return { ok: false, error: `That batch hasn't started yet (${info.text}) — check the year` };
    affiliation = { value: formatBatch(parsed) };
  }
  const contact = text("contact", input.contact, 120);
  for (const r of [studentId, affiliation, contact]) if ("error" in r && r.error) return { ok: false, error: r.error };

  let position: string | null = null;
  if (config.fields.position.enabled) {
    const p = input.position?.trim().toUpperCase() ?? "";
    if (!p) {
      if (config.fields.position.required) return { ok: false, error: "Preferred position is required" };
    } else if (!POSITIONS.has(p)) return { ok: false, error: "Position must be GK, DEF, MID or FWD" };
    else position = p;
  }

  if (config.fields.photo.enabled && config.fields.photo.required && !input.hasPhoto) {
    return { ok: false, error: "A photo is required" };
  }

  const answers: Record<string, string> = {};
  for (const q of config.questions) {
    const a = (input.answers[q.id] ?? "").trim();
    if (!a) {
      if (q.required) return { ok: false, error: `"${q.label}" is required` };
      continue;
    }
    if (a.length > 300) return { ok: false, error: `"${q.label}" is too long` };
    if (q.kind === "choice" && !q.options?.includes(a)) return { ok: false, error: `Pick one of the options for "${q.label}"` };
    answers[q.id] = a;
  }

  return {
    ok: true,
    data: {
      name,
      studentId: (studentId as { value: string | null }).value,
      affiliation: (affiliation as { value: string | null }).value,
      contact: (contact as { value: string | null }).value,
      position,
      answers,
    },
  };
}
