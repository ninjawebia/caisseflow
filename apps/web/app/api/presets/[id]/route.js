import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { licenceGate } from "../../../../lib/license";
import { validatePreset } from "@caisseflow/shared";
import { isUuid } from "../../../../lib/validate";

// PATCH /api/presets/[id] — mise à jour d'un style (gérant, gate licence).
export async function PATCH(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);
  if (!isUuid(id)) return json({ error: "Style introuvable" }, 404);

  const body = await req.json().catch(() => null);
  const v = validatePreset(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const p = v.value;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const own = await client.query(
      "SELECT id FROM image_presets WHERE id = $1 AND restaurant_id = $2",
      [id, user.restaurantId]
    );
    if (!own.rows[0]) {
      await client.query("ROLLBACK");
      return json({ error: "Style introuvable" }, 404);
    }
    if (p.par_defaut) {
      await client.query(
        "UPDATE image_presets SET par_defaut = false WHERE restaurant_id = $1 AND contexte = $2 AND par_defaut AND id <> $3",
        [user.restaurantId, p.contexte, id]
      );
    }
    const r = await client.query(
      `UPDATE image_presets
       SET nom=$1, forme=$2, cadrage=$3, ratio=$4, rayon=$5, ombre=$6, contexte=$7,
           par_defaut=$8, updated_at=now()
       WHERE id=$9 AND restaurant_id=$10 RETURNING *`,
      [p.nom, p.forme, p.cadrage, p.ratio, p.rayon, p.ombre, p.contexte, p.par_defaut, id, user.restaurantId]
    );
    await client.query("COMMIT");
    await audit(user, "preset_update", "image_presets", id, { nom: p.nom, defaut: p.par_defaut });
    return json({ preset: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") return json({ error: "Un style porte déjà ce nom (ou un défaut existe déjà)" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  } finally {
    client.release();
  }
}

// DELETE /api/presets/[id] — refusé si le style est par défaut ou utilisé :
// on ne casse jamais un affichage en place (gérant, gate licence).
export async function DELETE(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);
  if (!isUuid(id)) return json({ error: "Style introuvable" }, 404);

  const own = await pool.query(
    "SELECT id, par_defaut FROM image_presets WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurantId]
  );
  if (!own.rows[0]) return json({ error: "Style introuvable" }, 404);
  if (own.rows[0].par_defaut) {
    return json({ error: "Style par défaut — désignez un autre défaut avant de le supprimer" }, 409);
  }
  const used = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM categories WHERE preset_id = $1)
          + (SELECT COUNT(*)::int FROM articles WHERE preset_id = $1) AS n`,
    [id]
  );
  if (used.rows[0].n > 0) {
    return json({ error: `Style utilisé par ${used.rows[0].n} élément(s) — réassignez-les d'abord` }, 409);
  }

  await pool.query("DELETE FROM image_presets WHERE id = $1 AND restaurant_id = $2", [id, user.restaurantId]);
  await audit(user, "preset_delete", "image_presets", id, {});
  return json({ ok: true });
}
