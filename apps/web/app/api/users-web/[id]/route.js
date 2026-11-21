import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../lib/http";
import { isUuid } from "../../../../lib/validate";

// PATCH /api/users-web/[id] — enable/disable a back-office account (BO-2).
export async function PATCH(req, ctx) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "users")) return json({ error: "Accès refusé" }, 403);
  const id = (await ctx.params).id;
  if (!isUuid(id)) return json({ error: "Compte introuvable" }, 404);
  const body = await req.json().catch(() => null);
  const actif = body?.actif === true;

  if (!actif && id === user.id) return json({ error: "Impossible de désactiver votre propre compte" }, 400);

  const r = await pool.query(
    `UPDATE users_web SET actif=$1 WHERE id=$2
     AND ($3 IS NULL OR restaurant_id IS NULL OR restaurant_id=$3)
     RETURNING id, email, actif`,
    [actif, id, user.restaurantId]
  );
  if (r.rowCount === 0) return json({ error: "Compte introuvable" }, 404);
  await audit(user, actif ? "enable" : "disable", "users_web", id, { actif });
  return json({ user: r.rows[0] });
}
