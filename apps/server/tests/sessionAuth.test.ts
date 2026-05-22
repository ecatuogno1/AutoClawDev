import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("requestHasValidSession accepts the configured local session token", async () => {
  const home = mkdtempSync(join(tmpdir(), "autoclaw-session-auth-"));
  process.env.AUTOCLAWDEV_HOME = home;

  const { getSessionSecret, requestHasValidSession, SESSION_COOKIE_NAME } = await import("../src/lib/sessionAuth.ts");
  const secret = getSessionSecret();

  assert.equal(
    requestHasValidSession({
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${secret}`,
      },
    }),
    true,
  );

  assert.equal(
    requestHasValidSession({
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=invalid`,
      },
    }),
    false,
  );

  delete process.env.AUTOCLAWDEV_HOME;
  rmSync(home, { recursive: true, force: true });
});
