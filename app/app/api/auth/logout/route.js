import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, revokeSession } from "../../../../lib/auth";
import { assertSameOrigin, audit } from "../../../../lib/http";

// POST /api/auth/logout — revoke the session server-side, then send the
// browser back to the login screen (303): the session cookie is cleared in
// the redirect response itself, so no JSON body is ever displayed.
export async function POST(req) {
  const csrfCheck = assertSameOrigin(req);
  if (csrfCheck) return csrfCheck;
  const jar = await cookies();
  const user = await (await import("../../../../lib/auth")).getSessionUser(jar);
  await revokeSession(jar);
  if (user) await audit(user, "logout", "users_web", user.id, {});

  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
