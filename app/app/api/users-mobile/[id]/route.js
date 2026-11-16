import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";

// DELETE /api/users-mobile/[id] — disable (trace kept, never deleted).
export async function DELETE(req, ctx) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "users") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const id = (await ctx.params).id;

  const r = await pool.query(
    `UPDATE users_mobile SET actif=false, version=version+1, updated_at=now()
     WHERE id=$1 AND restaurant_id=$2 RETURNING id`,
    [id, user.restaurantId]
  );
  if (r.rowCount === 0) return json({ error: "Matricule introuvable" }, 404);
  await audit(user, "disable", "users_mobile", id, { actif: false });
  return json({ ok: true });
}
