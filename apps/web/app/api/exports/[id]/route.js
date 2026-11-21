import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { json } from "../../../../lib/http";
import { exportFilePath } from "../../../../lib/exports";
import fs from "fs";
import path from "path";

// GET /api/exports/[id] — stream a generated export (owner restaurant only).
// Permission: exports (gérant, comptable, auditeur) — same as generation.
export async function GET(req, ctx) {
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "exports") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const id = (await ctx.params).id;
  // Un identifiant mal formé ne doit jamais produire un 500 PostgreSQL
  // (`invalid input syntax for type uuid`) : il est traité comme introuvable.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: "Export introuvable" }, 404);
  }

  const r = await pool.query(
    "SELECT fichier, format FROM exports WHERE id=$1 AND restaurant_id=$2",
    [id, user.restaurantId]
  );
  const row = r.rows[0];
  if (!row) return json({ error: "Export introuvable" }, 404);

  // Path safety: the stored filename is basename-only and resolved against the
  // SAME directory used by POST (lib/exports.js) — no traversal possible.
  const target = exportFilePath(row.fichier);
  if (!target || !fs.existsSync(target)) {
    return json({ error: "Fichier d'export indisponible" }, 410);
  }

  const mime = row.format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8";
  const body = fs.readFileSync(target, "utf8");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": 'attachment; filename="' + path.basename(row.fichier) + '"',
    },
  });
}
