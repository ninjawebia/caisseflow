import { cookies } from "next/headers";
import { SESSION_COOKIE, revokeSession } from "../../../../lib/auth";
import { assertSameOrigin, json, audit } from "../../../../lib/http";

// POST /api/auth/logout — revokes the current session server-side.
export async function POST(req) {
  const csrfCheck = assertSameOrigin(req);
  if (csrfCheck) return csrfCheck;
  const jar = await cookies();
  const user = await (await import("../../../../lib/auth")).getSessionUser(jar);
  await revokeSession(jar);
  if (user) await audit(user, "logout", "users_web", user.id, {});
  jar.delete(SESSION_COOKIE);
  return json({ ok: true });
}
