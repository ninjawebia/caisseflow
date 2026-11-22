import { deviceAuth } from "../../../../lib/device";
import { licenceGate } from "../../../../lib/license";
import { pool } from "../../../../lib/db";
import { json } from "../../../../lib/http";
import { ensureDefaults, presetJoin, presetColumns } from "../../../../lib/presets";

// POST /api/sync/pull — reference data delta (menu, TVA, staff, tables) for the
// tablet caisse and terminals (PRD SYNC-3, last-write-wins on reference data).
// The PIN travels hashed only (bcrypt digest) — never in clear (PRD A8.2).
export async function POST(req) {
  const device = await deviceAuth(req);
  if (!device) return json({ error: "Jeton d'appareil invalide" }, 401);

  // Licence expirée/bloquée → le pull est suspendu (la caisse locale continue
  // hors ligne jusqu'à épuisement de sa grâce, SYNC-6, jamais de perte).
  const gate = await licenceGate(device.restaurantId);
  if (!gate.ok) return json({ error: gate.error }, 403);

  // Reference data stays available during grace1 (reminders only). Sync of
  // fiscal entries is what grace2 suspends — reference pull remains minimal.
  const since = new URL(req.url).searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(0);
  // Une date invalide doit être refusée explicitement (sinon PostgreSQL lève
  // `invalid input syntax for type timestamp` -> 500).
  if (Number.isNaN(sinceDate.getTime())) {
    return json({ error: "Paramètre since invalide (date ISO 8601 attendue)" }, 400);
  }

  // Presets par défaut garantis même si le seed n'a pas tourné (idempotent).
  await ensureDefaults(device.restaurantId);

  const cats = await pool.query(
    // `actif` est transmis explicitement, mais le pull ne contient que les
    // catégories ACTIVES : une catégorie archivée disparaît du lot, et la
    // caisse la désactive localement (pull complet, jamais de suppression).
    `SELECT c.id, c.nom, c.position, c.actif, c.photo_hash, c.photo_updated_at,
            ${presetColumns("c")}
     FROM categories c ${presetJoin("c")}
     WHERE c.restaurant_id=$1 AND c.actif = true ORDER BY c.position`,
    [device.restaurantId]
  );
  const arts = await pool.query(
    `SELECT a.id, a.categorie_id, a.nom, a.prix_ttc, a.taux_tva, a.actif, a.version,
            a.photo_hash, a.updated_at, ${presetColumns("a")}
     FROM articles a ${presetJoin("a")}
     WHERE a.restaurant_id=$1 AND a.updated_at > $2 ORDER BY a.nom`,
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
    poste: device.poste,
    categories: cats.rows.map((c) => ({
      ...c,
      preset: {
        forme: c.preset_forme, cadrage: c.preset_cadrage, ratio: c.preset_ratio,
        rayon: Number(c.preset_rayon), ombre: c.preset_ombre,
      },
    })),
    articles: arts.rows.map((a) => ({
      ...a,
      prix_ttc: Number(a.prix_ttc),
      taux_tva: Number(a.taux_tva),
      preset: {
        forme: a.preset_forme, cadrage: a.preset_cadrage, ratio: a.preset_ratio,
        rayon: Number(a.preset_rayon), ombre: a.preset_ombre,
      },
    })),
    users: staff.rows.map((u) => ({ matricule: u.matricule, nom: u.nom, role: u.role, pinHash: u.pin_hash, actif: u.actif, version: u.version })),
    tables: tables.rows,
    licence: { etat: lic.rows[0]?.etat || "active" },
    // Heure serveur : la caisse compare son horloge locale (contrôle FISC-4,
    // saut > 60 s → événement HORLOGE journalisé localement).
    serverTime: new Date().toISOString(),
    minAppVersion: "0.1.0", // SEC-2: force update below this version
  });
}
