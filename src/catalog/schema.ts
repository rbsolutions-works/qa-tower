import { z } from "zod";

export const ID_PATTERN = /^(SUR|ACT|FLW)-\d{2,}$/;
export const TAG_PATTERN = /\[((?:SUR|ACT|FLW)-\d{2,})\]/g;

export const entryStatusSchema = z.enum(["gap", "covered", "waived"]);
export type EntryStatus = z.infer<typeof entryStatusSchema>;

export const roleExpectationSchema = z.enum(["allow", "deny"]);
export type RoleExpectation = z.infer<typeof roleExpectationSchema>;

const idSchema = z.string().regex(ID_PATTERN, "id must look like SUR-001 / ACT-001 / FLW-001");

/** Fields shared by every catalog entry. */
const baseEntry = {
  id: idSchema,
  title: z.string().optional(),
  source: z.array(z.string()).default([]),
  status: entryStatusSchema.default("gap"),
  waived_reason: z.string().optional(),
  /** Spec files that cover this entry without (yet) tagging titles with the ID. */
  specs: z.array(z.string()).default([]),
  notes: z.string().optional(),
};

const requireWaivedReason = (e: { status: EntryStatus; waived_reason?: string }) =>
  e.status !== "waived" || (e.waived_reason ?? "").trim().length > 0;
const WAIVED_MSG = { message: "status: waived requires a waived_reason" };

export const surfaceSchema = z
  .object({
    ...baseEntry,
    route: z.string().min(1),
    /** role name -> allow | deny (deny includes redirect-away). */
    roles: z.record(z.string(), roleExpectationSchema).default({}),
    visual: z.boolean().default(false),
  })
  .refine(requireWaivedReason, WAIVED_MSG)
  .refine((e) => e.id.startsWith("SUR-"), { message: "surface ids must start with SUR-" });

export const actionSchema = z
  .object({
    ...baseEntry,
    name: z.string().min(1),
    kind: z.enum(["rpc", "server-action", "api", "command"]).default("rpc"),
    roles: z.record(z.string(), roleExpectationSchema).default({}),
  })
  .refine(requireWaivedReason, WAIVED_MSG)
  .refine((e) => e.id.startsWith("ACT-"), { message: "action ids must start with ACT-" });

export const flowSchema = z
  .object({
    ...baseEntry,
    steps: z.array(z.string()).default([]),
  })
  .refine(requireWaivedReason, WAIVED_MSG)
  .refine((e) => e.id.startsWith("FLW-"), { message: "flow ids must start with FLW-" });

export const fingerprintSchema = z.object({
  path: z.string().min(1),
  hash: z.string().regex(/^[0-9a-f]{40,64}$/, "hash must be a git blob hash"),
  /** Catalog IDs that must be reviewed when this file changes. */
  owners: z.array(idSchema).default([]),
});

export type Surface = z.infer<typeof surfaceSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Flow = z.infer<typeof flowSchema>;
export type Fingerprint = z.infer<typeof fingerprintSchema>;
export type CatalogEntry = Surface | Action | Flow;

export interface Catalog {
  surfaces: Surface[];
  actions: Action[];
  flows: Flow[];
  fingerprints: Fingerprint[];
  /** Every entry keyed by ID (fingerprints excluded — they have no ID). */
  byId: Map<string, CatalogEntry>;
}
