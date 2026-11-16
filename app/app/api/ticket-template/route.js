import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";

// PATCH /api/ticket-template — update free fields only (IMP-4). Legal mentions
// are not configurable: they are enforced by the caisse app itself.
export async function PATCH(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "ticket") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const logoText = String(body?.logo_text || "").slice(0, 40);
  const mentions = String(body?.mentions || "").slice(0, 200);

  const r = await pool.query(
    `UPDATE ticket_template SET logo_text=$1, mentions=$2, updated_at=now()
     WHERE restaurant_id=$3
     RETURNING logo_text, mentions, updated_at`,
    [logoText, mentions, user.restaurantId]
  );
  if (r.rowCount === 0) {
    const ins = await pool.query(
      "INSERT INTO ticket_template (restaurant_id, logo_text, mentions) VALUES ($1,$2,$3) RETURNING logo_text, mentions, updated_at",
      [user.restaurantId, logoText, mentions]
    );
    await audit(user, "create", "ticket_template", user.restaurantId, { logoText });
    return json({ template: ins.rows[0] });
  }

  await audit(user, "update", "ticket_template", user.restaurantId, { logoText });
  return json({ template: r.rows[0] });
}
