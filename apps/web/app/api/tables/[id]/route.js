import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { isUuid } from "../../../../lib/validate";

// DELETE /api/tables/[id] — disable (never hard-delete; trace kept).
export async function DELETE(req, ctx) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "tables") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const id = (await ctx.params).id;
  if (!isUuid(id)) return json({ error: "Table introuvable" }, 404);

  const r = await pool.query(
    `UPDATE tables_resto SET actif=false WHERE id=$1 AND restaurant_id=$2 AND actif=true RETURNING id`,
    [id, user.restaurantId]
  );
  if (r.rowCount === 0) return json({ error: "Table introuvable" }, 404);
  await audit(user, "disable", "tables_resto", id, { actif: false });
  return json({ ok: true });
}
