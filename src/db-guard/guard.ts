export interface DbTarget {
  host?: string;
  user?: string;
  database?: string;
  /** Free-form extra fields worth scanning (e.g. a full connection string). */
  extra?: string;
}

export interface DbGuardOptions {
  /**
   * Case-insensitive substrings that must NEVER appear in host/user/database/extra.
   * A match throws unconditionally — there is no override for a deny-list hit.
   */
  denyRefs: string[];
  /**
   * Hosts considered safe to connect to without an explicit opt-in
   * (typically loopback addresses). Exact match, case-insensitive.
   */
  allowHosts: string[];
  /**
   * Name of an environment variable that, when truthy, permits a
   * non-allow-listed host that does NOT match denyRefs. Consumers name
   * this explicitly per project; there is no default opt-in.
   */
  allowRemoteEnvVar?: string;
  env?: NodeJS.ProcessEnv;
}

export class DbGuardError extends Error {}

function haystack(target: DbTarget): string {
  return [target.host, target.user, target.database, target.extra]
    .filter((v): v is string => Boolean(v))
    .join(" ")
    .toLowerCase();
}

/**
 * Throws unless `target` is a safe database to run tests against.
 *
 * Order of checks:
 * 1. Deny-list substring match anywhere in host/user/database/extra -> hard
 *    throw, no override possible. This is the non-negotiable guard.
 * 2. Host is in allowHosts -> pass.
 * 3. allowRemoteEnvVar is set and truthy in env -> pass.
 * 4. Otherwise -> throw.
 */
export function assertSafeDbTarget(target: DbTarget, opts: DbGuardOptions): void {
  const hay = haystack(target);
  for (const ref of opts.denyRefs) {
    if (ref && hay.includes(ref.toLowerCase())) {
      throw new DbGuardError(
        `refusing to run: target matches a denied reference ("${ref}"). ` +
          `host=${target.host ?? "?"} database=${target.database ?? "?"}`,
      );
    }
  }

  const host = (target.host ?? "").toLowerCase();
  if (opts.allowHosts.some((h) => h.toLowerCase() === host)) return;

  const env = opts.env ?? process.env;
  if (opts.allowRemoteEnvVar && truthy(env[opts.allowRemoteEnvVar])) return;

  throw new DbGuardError(
    `refusing to run: host "${target.host ?? "(unset)"}" is not in the local allow-list ` +
      `[${opts.allowHosts.join(", ")}]${
        opts.allowRemoteEnvVar ? ` and ${opts.allowRemoteEnvVar} is not set` : ""
      }.`,
  );
}

function truthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}
