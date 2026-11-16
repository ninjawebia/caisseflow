import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";

// POST /api/users-mobile — create a staff matricule with PIN (BO-2).
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "users") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const matricule = String(body?.matricule || "").trim().toUpperCase();
  const nom = String(body?.nom || "").trim();
  const role = String(body?.role || "serveur");
  const pin = String(body?.pin || "");

  if (!/^[A-Z0-9]{1,8}$/.test(matricule)) return json({ error: "Matricule invalide (1–8 alphanumériques)" }, 400);
  if (nom.length < 2 || nom.length > 60) return json({ error: "Nom obligatoire (2–60 caractères)" }, 400);
  if (!["gerant", "second", "serveur", "cuisine"].includes(role)) return json({ error: "Rôle invalide" }, 400);
  if (!/^[0-9]{4,6}$/.test(pin)) return json({ error: "PIN invalide (4–6 chiffres)" }, 400);

  const bcrypt = require("bcryptjs");
  const pinHash = bcrypt.hashSync(pin, 10);

  try {
    const r = await pool.query(
      `INSERT INTO users_mobile (restaurant_id, matricule, nom, role, pin_hash)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, matricule, nom, role, actif, version`,
      [user.restaurantId, matricule, nom, role, pinHash]
    );
    await audit(user, "create", "users_mobile", r.rows[0].id, { matricule, role });
    return json({ user: r.rows[0] }, 201);
  } catch (e) {
    if (e.code === "23505") return json({ error: "Ce matricule existe déjà" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  }
}
