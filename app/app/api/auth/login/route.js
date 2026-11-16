import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE, cookieOptions } from "../../../lib/auth";
import { assertSameOrigin, json, rateLimit, registerLoginFailure, clearLoginFailures, audit } from "../../../lib/http";
import bcrypt from "bcryptjs";
import { pool } from "../../../lib/db";

// POST /api/auth/login — e-mail + password (+ TOTP when enabled on the account).
// Brute-force controls: in-memory limiter + durable account lockout (SEC-6).
export async function POST(req) {
  const csrfCheck = assertSameOrigin(req);
  if (csrfCheck) return csrfCheck;

  const ip = req.headers.get("x-forwarded-for") || "local";
  if (!rateLimit(`login:${ip}`, 60, 60000)) {
    return json({ error: "Trop de tentatives — patientez une minute" }, 429);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const email = String(body.email || "").trim().toLowerCase();
  const pwd = String(body.pwd || "");
  const totp = String(body.totp || "").trim();

  if (!email || !pwd || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Identifiants invalides" }, 400);
  }

  const r = await pool.query(
    "SELECT id, hashedPassword, role, nom, totp_enabled, totp_secret, locked_until, actif FROM users_web WHERE email = $1",
    [email]
  );
  const user = r.rows[0];
  if (!user || !user.actif) {
    return json({ error: "Identifiants incorrects" }, 401);
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return json({ error: "Compte verrouillé — réessayez dans quelques minutes" }, 423);
  }

  const ok = bcrypt.compareSync(pwd, user.hashedPassword);
  if (!ok) {
    await registerLoginFailure(email);
    return json({ error: "Identifiants incorrects" }, 401);
  }

  if (user.totp_enabled) {
    if (!totp) return json({ error: "Code 2FA requis pour ce profil" }, 401);
    const { verifyTotp } = require("../../../lib/totp");
    if (!verifyTotp(user.totp_secret, totp)) {
      await registerLoginFailure(email);
      return json({ error: "Code 2FA invalide" }, 401);
    }
  }

  await clearLoginFailures(user.id);
  const session = await createSessionWrapped(user.id);
  const jar = await cookies();
  // Session cookie: HttpOnly, SameSite=Lax, Secure in production (auth.js).
  jar.set(SESSION_COOKIE, session.token, cookieOptions());
  await audit({ id: user.id, email }, "login", "users_web", user.id, { role: user.role });

  return json({ ok: true, user: { email, role: user.role, nom: user.nom } });
}

async function createSessionWrapped(userId) {
  const { createSession } = require("../../../lib/auth");
  return createSession(userId);
}

export async function GET() {
  return json({ error: "Méthode non autorisée" }, 405);
}
