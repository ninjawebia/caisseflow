import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";
import { licenceGate } from "../../../lib/license";
import { validatePreset } from "@caisseflow/shared";
import { ensureDefaults, listPresets } from "../../../lib/presets";

// GET /api/presets — styles d'image du restaurant (tout le personnel connecté
// en lecture ; la tablette les reçoit via le sync pull).
export async function GET() {
  const user = await getSessionUser(await cookies());
  if (!user || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  await ensureDefaults(user.restaurantId);
  return json({ presets: await listPresets(user.restaurantId) });
}

// POST /api/presets — création (gérant, gate licence). `par_defaut: true`
// remplace l'ancien style par défaut du même contexte (transaction) : un seul
// défaut par (restaurant, contexte), garanti aussi par l'index partiel SQL.
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);

  const body = await req.json().catch(() => null);
  const v = validatePreset(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const p = v.value;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (p.par_defaut) {
      await client.query(
        "UPDATE image_presets SET par_defaut = false WHERE restaurant_id = $1 AND contexte = $2 AND par_defaut",
        [user.restaurantId, p.contexte]
      );
    }
    const r = await client.query(
      `INSERT INTO image_presets
         (restaurant_id, nom, forme, cadrage, ratio, rayon, ombre, contexte, par_defaut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user.restaurantId, p.nom, p.forme, p.cadrage, p.ratio, p.rayon, p.ombre, p.contexte, p.par_defaut]
    );
    await client.query("COMMIT");
    await audit(user, "preset_create", "image_presets", r.rows[0].id, { nom: p.nom, contexte: p.contexte });
    return json({ preset: r.rows[0] }, 201);
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") return json({ error: "Un style porte déjà ce nom (ou un défaut existe déjà)" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  } finally {
    client.release();
  }
}
