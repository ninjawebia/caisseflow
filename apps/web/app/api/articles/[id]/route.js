import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { validateArticle } from "@caisseflow/shared";

// PATCH /api/articles/[id] — update (price change creates a new version, BO-1).
export async function PATCH(req, ctx) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const id = (await ctx.params).id;

  const body = await req.json().catch(() => null);
  const v = validateArticle(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const { nom, prix_ttc: prix, taux_tva: tva } = v.value;
  const cat = body?.categorie_id || null;
  const actif = body?.actif !== false;

  const before = await pool.query(
    "SELECT prix_ttc FROM articles WHERE id=$1 AND restaurant_id=$2", [id, user.restaurantId]
  );
  if (before.rowCount === 0) return json({ error: "Article introuvable" }, 404);

  try {
    // Price change bumps the data version (sync devices pick it up; history of
    // prices is tracked by the version column, PRD BO-1).
    const bump = Number(before.rows[0].prix_ttc) !== prix ? 1 : 0;
    const r = await pool.query(
      `UPDATE articles
       SET nom=$1, prix_ttc=$2, taux_tva=$3, categorie_id=$4, actif=$5,
           version = version + $6, updated_at = now()
       WHERE id=$7 AND restaurant_id=$8
       RETURNING id, nom, prix_ttc, taux_tva, actif, categorie_id,
                 (SELECT c.nom FROM categories c WHERE c.id = articles.categorie_id) AS categorie_nom`,
      [nom, prix, tva, cat, actif, bump, id, user.restaurantId]
    );
    const article = { ...r.rows[0], prix_ttc: Number(r.rows[0].prix_ttc), taux_tva: Number(r.rows[0].taux_tva) };
    await audit(user, "update", "articles", id, { nom, prix_ttc: prix, taux_tva: tva, actif });
    return json({ article });
  } catch (e) {
    if (e.code === "23505") return json({ error: "Un article porte déjà ce nom" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  }
}

// DELETE /api/articles/[id] — soft disable (no fiscal data is ever deleted).
export async function DELETE(req, ctx) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const id = (await ctx.params).id;

  const r = await pool.query(
    "UPDATE articles SET actif=false, version=version+1, updated_at=now() WHERE id=$1 AND restaurant_id=$2 RETURNING id",
    [id, user.restaurantId]
  );
  if (r.rowCount === 0) return json({ error: "Article introuvable" }, 404);
  await audit(user, "disable", "articles", id, { actif: false });
  return json({ ok: true });
}
