import { deviceAuth, syncAllowed } from "../../../../lib/device";
import { pool } from "../../../../lib/db";
import { json } from "../../../../lib/http";

// POST /api/sync/pull — reference data delta (menu, TVA, staff, tables) for the
// tablet caisse and terminals (PRD SYNC-3, last-write-wins on reference data).
// The PIN travels hashed only (bcrypt digest) — never in clear (PRD A8.2).
export async function POST(req) {
  const device = await deviceAuth(req);
  if (!device) return json({ error: "Jeton d'appareil invalide" }, 401);

  // Reference data stays available during grace1 (reminders only). Sync of
  // fiscal entries is what grace2 suspends — reference pull remains minimal.
  const since = new URL(req.url).searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(0);

  const cats = await pool.query(
    `SELECT id, nom, position FROM categories WHERE restaurant_id=$1 AND actif = true ORDER BY position`,
    [device.restaurantId]
  );
  const arts = await pool.query(
    `SELECT id, categorie_id, nom, prix_ttc, taux_tva, actif, version, photo_hash, updated_at
     FROM articles WHERE restaurant_id=$1 AND updated_at > $2 ORDER BY nom`,
    [device.restaurantId, sinceDate]
  );
  const staff = await pool.query(
    `SELECT matricule, nom, role, pin_hash, actif, version FROM users_mobile
     WHERE restaurant_id=$1 ORDER BY matricule`,
    [device.restaurantId]
  );
  const tables = await pool.query(
    `SELECT id, nom, salle, places, actif FROM tables_resto WHERE restaurant_id=$1 ORDER BY salle, nom`,
    [device.restaurantId]
  );
  const lic = await pool.query(`SELECT etat FROM licences WHERE restaurant_id=$1`, [device.restaurantId]);

  return json({
    categories: cats.rows,
    articles: arts.rows.map((a) => ({ ...a, prix_ttc: Number(a.prix_ttc), taux_tva: Number(a.taux_tva) })),
    users: staff.rows.map((u) => ({ matricule: u.matricule, nom: u.nom, role: u.role, pinHash: u.pin_hash, actif: u.actif, version: u.version })),
    tables: tables.rows,
    licence: { etat: lic.rows[0]?.etat || "active" },
    minAppVersion: "0.1.0", // SEC-2: force update below this version
  });
}
