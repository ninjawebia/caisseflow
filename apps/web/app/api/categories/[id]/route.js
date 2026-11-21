import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { licenceGate } from "../../../../lib/license";
import { validateCategory } from "@caisseflow/shared";
import { isUuid } from "../../../../lib/validate";

// Chargement de la catégorie du restaurant de l'utilisateur (menu perm).
async function loadCategory(id, restaurantId) {
  const r = await pool.query(
    "SELECT id, nom, position, actif FROM categories WHERE id = $1 AND restaurant_id = $2",
    [id, restaurantId]
  );
  return r.rows[0] || null;
}

// PATCH /api/categories/[id] — rename / reorder / archive (backlog F1, gérant).
// Archiver = actif:false : absente des sélections et du sync pull, conservée
// en base pour la cohérence des exports/rapports historiques (PRD 14.1).
export async function PATCH(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  // Gate licence : écritures refusées si expirée/bloquée (lecture OK, LIC-4).
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);
  if (!isUuid(id)) return json({ error: "Catégorie introuvable" }, 404);


  const cat = await loadCategory(id, user.restaurantId);
  if (!cat) return json({ error: "Catégorie introuvable" }, 404);

  const body = await req.json().catch(() => null);
  const changes = {};
  if (body?.nom !== undefined) {
    const v = validateCategory({ nom: body.nom, position: cat.position });
    if (!v.ok) return json({ error: v.error }, 400);
    changes.nom = v.value.nom;
  }
  if (body?.position !== undefined) {
    const p = Number(body.position);
    if (!(Number.isInteger(p) && p >= 0 && p <= 999)) return json({ error: "Position invalide (entier 0–999)" }, 400);
    changes.position = p;
  }
  if (body?.actif !== undefined) {
    changes.actif = body.actif === true;
  }
  if (Object.keys(changes).length === 0) return json({ error: "Aucune modification" }, 400);

  const set = Object.keys(changes).map((k, i) => `${k} = $${i + 2}`).join(", ");
  try {
    const r = await pool.query(
      `UPDATE categories SET ${set} WHERE id = $1 RETURNING id, nom, position, actif`,
      [id, ...Object.values(changes)]
    );
    await audit(user, body?.actif !== undefined && Object.keys(changes).length === 1 ? (changes.actif ? "restore" : "archive") : "update", "categories", id, changes);
    return json({ category: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") return json({ error: "Une catégorie porte déjà ce nom" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  }
}

// DELETE /api/categories/[id] — hard delete, gérant only, UNIQUEMENT si vide.
// Garde-fou PRD 14.1 : une catégorie avec articles est refusée (400) — il faut
// l'archiver ou ré-associer les articles d'abord. (La FK articles.categorie_id
// est ON DELETE SET NULL côté base : le garde-fou applicatif est la règle
// métier, le comportement SQL n'est qu'un filet.)
export async function DELETE(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  // Gate licence : écritures refusées si expirée/bloquée (lecture OK, LIC-4).
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);
  if (!isUuid(id)) return json({ error: "Catégorie introuvable" }, 404);


  const cat = await loadCategory(id, user.restaurantId);
  if (!cat) return json({ error: "Catégorie introuvable" }, 404);

  const c = await pool.query(
    "SELECT COUNT(*)::int AS n FROM articles WHERE categorie_id = $1",
    [id]
  );
  if (c.rows[0].n > 0) {
    return json(
      { error: `Catégorie non vide — archivez-la ou ré-associez ses ${c.rows[0].n} article(s) avant suppression`, nb_articles: c.rows[0].n },
      400
    );
  }

  await pool.query("DELETE FROM categories WHERE id = $1", [id]);
  await audit(user, "delete", "categories", id, { nom: cat.nom });
  return json({ ok: true });
}
