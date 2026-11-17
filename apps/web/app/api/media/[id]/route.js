import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { licenceGate } from "../../../../lib/license";
import { archive } from "../../../../lib/uploads";

// DELETE /api/media/[id] — suppression d'un asset de la bibliothèque (gérant
// only, gate licence). REFUSÉ (400) si au moins un article utilise le contenu
// (photo_file dénormalisé) — il faut d'abord retirer la photo des articles.
// Sinon : fichier archivé (rétention 30 j) + ligne supprimée + audit.
export async function DELETE(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);

  const m = await pool.query(
    "SELECT file, hash FROM media WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurantId]
  );
  if (!m.rows[0]) return json({ error: "Média introuvable" }, 404);

  const used = await pool.query(
    "SELECT COUNT(*)::int AS n FROM articles WHERE restaurant_id = $1 AND photo_file = $2",
    [user.restaurantId, m.rows[0].file]
  );
  if (used.rows[0].n > 0) {
    return json(
      { error: `Média utilisé par ${used.rows[0].n} article(s) — retirez d'abord la photo des articles concernés`, nb_articles: used.rows[0].n },
      400
    );
  }

  archive(m.rows[0].file); // fichier déplacé vers uploads/archived/ (30 j)
  await pool.query("DELETE FROM media WHERE id = $1", [id]);
  await audit(user, "media_delete", "media", id, { hash: m.rows[0].hash.slice(0, 12) });
  return json({ ok: true });
}
