import crypto from "crypto";
import { cookies } from "next/headers";
import { getSessionUser, can, hashToken } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";

// GET /api/devices — liste des tablettes enrôlées (gérant). Le jeton n'est
// JAMAIS renvoyé (seul le hash est stocké) : il n'est affiché qu'une fois à la
// création.
export async function GET() {
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "devices") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const r = await pool.query(
    `SELECT d.id, d.poste, d.actif, d.created_at,
            EXISTS (SELECT 1 FROM journal_replica j
                    WHERE j.restaurant_id = d.restaurant_id AND j.poste = d.poste LIMIT 1) AS a_synchronise
     FROM device_tokens d
     WHERE d.restaurant_id = $1
     ORDER BY d.actif DESC, d.poste`,
    [user.restaurantId]
  );
  return json({ devices: r.rows });
}

// POST /api/devices — enrôlement d'une tablette (gérant uniquement, PRD 4.1.10
// « installation APK < 10 min » + SYNC-4 préfixe par poste). Génère un jeton
// aléatoire 256 bits, stocké HASHÉ (SHA-256) — renvoyé EN CLAIR une seule fois
// (la tablette le saisit à l'enrôlement, puis le conserve dans le Keystore).
// Un seul jeton ACTIF par poste : ré-enrôlement = révoquer d'abord (409 sinon).
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "devices") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const poste = String(body?.poste || "").trim().toUpperCase();
  if (!/^POSTE-([0-9]{2})$/.test(poste)) {
    return json({ error: "Identifiant de poste invalide (format POSTE-01 à POSTE-99)" }, 400);
  }

  // Numérotation continue sans collision : un poste = un compteur (SYNC-4).
  // Deux jetons actifs pour le même poste créeraient deux compteurs concurrents.
  const active = await pool.query(
    "SELECT id FROM device_tokens WHERE restaurant_id = $1 AND poste = $2 AND actif = true",
    [user.restaurantId, poste]
  );
  if (active.rows[0]) {
    return json(
      { error: "Ce poste est déjà enrôlé — révoquez l'ancien jeton avant de ré-enrôler", device_id: active.rows[0].id },
      409
    );
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const ins = await pool.query(
    `INSERT INTO device_tokens (restaurant_id, poste, token_hash)
     VALUES ($1,$2,$3) RETURNING id, poste, created_at`,
    [user.restaurantId, poste, hashToken(token)]
  );
  await audit(user, "device_create", "device_tokens", ins.rows[0].id, { poste });
  // Jeton en clair : UNE seule fois, jamais relisible (aucun endpoint ne le renvoie).
  return json({ device: ins.rows[0], token }, 201);
}
