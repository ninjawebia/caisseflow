import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";

// POST /api/tables — create (BO-3, gérant only).
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "tables") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const nom = String(body?.nom || "").trim().toUpperCase();
  const salle = String(body?.salle || "Salle 1").trim();
  const places = Number(body?.places);

  if (nom.length < 1 || nom.length > 10) return json({ error: "Nom de table invalide" }, 400);
  if (salle.length < 1 || salle.length > 30) return json({ error: "Nom de salle invalide" }, 400);
  if (!(places >= 1 && places <= 20)) return json({ error: "Places invalide (1–20)" }, 400);

  try {
    const r = await pool.query(
      `INSERT INTO tables_resto (restaurant_id, nom, salle, places)
       VALUES ($1,$2,$3,$4) RETURNING id, nom, salle, places, actif`,
      [user.restaurantId, nom, salle, places]
    );
    await audit(user, "create", "tables_resto", r.rows[0].id, { nom, salle, places });
    return json({ table: r.rows[0] }, 201);
  } catch (e) {
    if (e.code === "23505") return json({ error: "Ce nom de table existe déjà" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  }
}
