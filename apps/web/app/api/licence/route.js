import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";

// PATCH /api/licence — change the licence state (LIC-2/3/4, admin only).
// Only "active" resets the unpaid-since tracking; grace phases record their
// timestamps so the app can show the right banners.
export async function PATCH(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "licence")) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const etat = String(body?.etat || "");
  if (!["active", "grace1", "grace2", "bloquee"].includes(etat)) {
    return json({ error: "État de licence invalide" }, 400);
  }

  // Admin plateforme has no restaurant of its own: target the restaurant from
  // the request body, or (single-restaurant pilot) the only existing one.
  let restaurantId = user.restaurantId;
  if (!restaurantId && user.role === "admin_plateforme") {
    restaurantId = String(body?.restaurantId || "") || null;
    if (!restaurantId) {
      const first = await pool.query("SELECT id FROM restaurants ORDER BY created_at LIMIT 1");
      restaurantId = first.rows[0]?.id || null;
    }
  }
  if (!restaurantId) return json({ error: "Restaurant cible requis" }, 400);

  const r = await pool.query(
    `UPDATE licences
     SET etat=$1,
         impayee_depuis = CASE WHEN $1 = 'active' THEN NULL ELSE COALESCE(impayee_depuis, CURRENT_DATE - 1) END,
         grace1_at = CASE WHEN $1 = 'grace1' THEN now() ELSE grace1_at END,
         grace2_at = CASE WHEN $1 = 'grace2' THEN now() ELSE grace2_at END,
         bloque_at = CASE WHEN $1 = 'bloquee' THEN now() ELSE bloque_at END,
         updated_at = now()
     WHERE restaurant_id=$2
     RETURNING etat, impayee_depuis, grace1_at, grace2_at, bloque_at`,
    [etat, restaurantId]
  );
  if (r.rowCount === 0) return json({ error: "Licence introuvable pour ce restaurant" }, 404);

  await audit(user, "update", "licences", restaurantId, { etat });
  return json({ licence: r.rows[0] });
}
