import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";
import { licenceGate } from "../../../lib/license";
import { validateArticle } from "@caisseflow/shared";
import { validPresetId } from "../../../lib/presets";

// POST /api/articles — create (BO-1, gérant only, server-side re-validation).
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  // Gate licence : écritures refusées si expirée/bloquée (lecture OK, LIC-4).
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);


  const body = await req.json().catch(() => null);
  const v = validateArticle(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const { nom, prix_ttc: prix, taux_tva: tva } = v.value;
  const cat = body?.categorie_id || null;
  const actif = body?.actif !== false;

  // Style d'image optionnel (NULL = style par défaut du contexte menu).
  const preset = await validPresetId(user.restaurantId, body?.preset_id);
  if (!preset.ok) return json({ error: preset.error }, 400);

  const catOk = cat
    ? (await pool.query("SELECT 1 FROM categories WHERE id=$1 AND restaurant_id=$2", [cat, user.restaurantId])).rowCount > 0
    : true;
  if (!catOk) return json({ error: "Catégorie inconnue" }, 400);

  try {
    const r = await pool.query(
      `INSERT INTO articles (restaurant_id, categorie_id, nom, prix_ttc, taux_tva, actif, preset_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, nom, prix_ttc, taux_tva, actif, categorie_id, preset_id,
                 (SELECT c.nom FROM categories c WHERE c.id = articles.categorie_id) AS categorie_nom`,
      [user.restaurantId, cat, nom, prix, tva, actif, preset.id]
    );
    const article = { ...r.rows[0], prix_ttc: Number(r.rows[0].prix_ttc), taux_tva: Number(r.rows[0].taux_tva) };
    await audit(user, "create", "articles", article.id, { nom, prix_ttc: prix, taux_tva: tva });
    return json({ article }, 201);
  } catch (e) {
    if (e.code === "23505") return json({ error: "Un article porte déjà ce nom" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  }
}
