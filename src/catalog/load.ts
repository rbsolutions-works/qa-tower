import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import {
  type Catalog,
  type CatalogEntry,
  surfaceSchema,
  actionSchema,
  flowSchema,
  fingerprintSchema,
} from "./schema.js";

export class CatalogError extends Error {}

function loadYamlArray<S extends z.ZodTypeAny>(
  dir: string,
  file: string,
  schema: S,
): z.infer<S>[] {
  const path = join(dir, file);
  if (!existsSync(path)) return [];
  const raw = parse(readFileSync(path, "utf8"));
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new CatalogError(`${file}: expected a top-level YAML array`);
  }
  return raw.map((item, i) => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`)
        .join("; ");
      const id = typeof item === "object" && item !== null ? (item as { id?: string }).id : undefined;
      throw new CatalogError(`${file}[${i}]${id ? ` (${id})` : ""}: ${detail}`);
    }
    return parsed.data;
  });
}

/**
 * Load and validate a catalog directory containing any of:
 * surfaces.yaml, actions.yaml, flows.yaml, fingerprints.yaml.
 * Throws CatalogError on schema violations or duplicate IDs.
 */
export function loadCatalog(dir: string): Catalog {
  if (!existsSync(dir)) throw new CatalogError(`catalog directory not found: ${dir}`);

  const surfaces = loadYamlArray(dir, "surfaces.yaml", surfaceSchema);
  const actions = loadYamlArray(dir, "actions.yaml", actionSchema);
  const flows = loadYamlArray(dir, "flows.yaml", flowSchema);
  const fingerprints = loadYamlArray(dir, "fingerprints.yaml", fingerprintSchema);

  const byId = new Map<string, CatalogEntry>();
  for (const entry of [...surfaces, ...actions, ...flows]) {
    if (byId.has(entry.id)) throw new CatalogError(`duplicate catalog id: ${entry.id}`);
    byId.set(entry.id, entry);
  }

  for (const fp of fingerprints) {
    for (const owner of fp.owners) {
      if (!byId.has(owner)) {
        throw new CatalogError(`fingerprints.yaml: ${fp.path} owner ${owner} is not a catalog id`);
      }
    }
  }

  return { surfaces, actions, flows, fingerprints, byId };
}
