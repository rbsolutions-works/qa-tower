import { describe, it, expect } from "vitest";
import { assertSafeDbTarget, DbGuardError } from "../src/db-guard/guard.js";

const baseOpts = {
  denyRefs: ["prod-project-ref", "urgentcargo"],
  allowHosts: ["127.0.0.1", "localhost"],
  allowRemoteEnvVar: "TEST_ALLOW_REMOTE",
};

describe("assertSafeDbTarget", () => {
  it("passes for an allow-listed local host", () => {
    expect(() => assertSafeDbTarget({ host: "127.0.0.1" }, baseOpts)).not.toThrow();
  });

  it("is case-insensitive when matching allowHosts", () => {
    expect(() => assertSafeDbTarget({ host: "LOCALHOST" }, baseOpts)).not.toThrow();
  });

  it("throws for a non-allow-listed host with no opt-in", () => {
    expect(() => assertSafeDbTarget({ host: "db.example.com" }, baseOpts)).toThrow(DbGuardError);
  });

  it("allows a non-local host when the named env var is truthy", () => {
    expect(() =>
      assertSafeDbTarget(
        { host: "staging.example.com" },
        { ...baseOpts, env: { TEST_ALLOW_REMOTE: "1" } },
      ),
    ).not.toThrow();
  });

  it("denies a deny-listed ref even when the opt-in env var is set (no override)", () => {
    expect(() =>
      assertSafeDbTarget(
        { host: "prod-project-ref.supabase.co" },
        { ...baseOpts, env: { TEST_ALLOW_REMOTE: "1" } },
      ),
    ).toThrow(DbGuardError);
  });

  it("checks the deny-list against user and database fields too", () => {
    expect(() =>
      assertSafeDbTarget({ host: "127.0.0.1", database: "urgentcargo_prod" }, baseOpts),
    ).toThrow(DbGuardError);
  });

  it("checks the deny-list against a free-form extra field (e.g. a connection string)", () => {
    expect(() =>
      assertSafeDbTarget(
        { extra: "postgres://user@prod-project-ref.supabase.co/db" },
        baseOpts,
      ),
    ).toThrow(DbGuardError);
  });

  it("deny-list match is case-insensitive", () => {
    expect(() => assertSafeDbTarget({ host: "PROD-PROJECT-REF.example.com" }, baseOpts)).toThrow(
      DbGuardError,
    );
  });
});
