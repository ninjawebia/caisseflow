import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { isUuid } from "../../../../lib/validate";

// DELETE /api/devices/[id] — révocation d'une tablette (gérant). Le jeton est
// désactivé (actif=false) : les sync push/pull répondent 401 immédiatement.
// JAMAIS de suppression de ligne (traçabilité) — ré-enrôlement = nouveau jeton.
export async function DELETE(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "devices") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  if (!isUuid(id)) return json({ error: "Tablette introuvable ou déjà révoquée" }, 404);

  const r = await pool.query(
    `UPDATE device_tokens SET actif = false
     WHERE id = $1 AND restaurant_id = $2 AND actif = true
     RETURNING id, poste`,
    [id, user.restaurantId]
  );
  if (!r.rows[0]) return json({ error: "Tablette introuvable ou déjà révoquée" }, 404);
  await audit(user, "device_revoke", "device_tokens", id, { poste: r.rows[0].poste });
  return json({ ok: true });
}
