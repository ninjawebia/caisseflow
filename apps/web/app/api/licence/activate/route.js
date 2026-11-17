import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { verifyKey, fingerprint } from "../../../../lib/license";

// POST /api/licence/activate — le client (gérant) colle sa clé de licence
// signée « CF-… ». Vérification 100 % LOCALE (signature Ed25519, aucun serveur
// de licences) : si la clé est valide, la licence devient active avec sa date
// d'expiration ; sinon l'état courant est conservé et un message explicite est
// renvoyé. Traçabilité : audit_log.
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "licence_admin") || !user.restaurantId) {
    return json({ error: "Accès refusé — seul le gérant peut activer une licence" }, 403);
  }

  const body = await req.json().catch(() => null);
  if (!body?.cle) return json({ error: "Clé de licence manquante" }, 400);

  const v = verifyKey(body.cle, user.restaurantId);
  if (!v.ok) return json({ error: v.error }, 400);

  const exp = v.payload.exp ?? null; // NULL = perpétuelle
  const plan = v.payload.plan ?? null;
  const fid = fingerprint(body.cle);

  const r = await pool.query(
    `UPDATE licences
     SET etat = 'active', expires_at = $2, plan = $3, cle_id = $4,
         impayee_depuis = NULL, bloque_at = NULL, updated_at = now()
     WHERE restaurant_id = $1
     RETURNING etat, expires_at, plan`,
    [user.restaurantId, exp, plan, fid]
  );
  if (!r.rows[0]) return json({ error: "Restaurant sans licence enregistrée" }, 404);

  await audit(user, "licence_activate", "licences", user.restaurantId, { plan, expires: exp, cle_id: fid });
  return json({ ok: true, licence: r.rows[0] });
}
