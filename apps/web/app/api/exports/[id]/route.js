import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { json } from "../../../../lib/http";
import fs from "fs";
import path from "path";

const EXPORT_DIR = path.join(process.cwd(), "var", "exports");

// GET /api/exports/[id] — stream a generated export (owner restaurant only).
// Permission: exports (gérant, comptable, auditeur) — same as generation.
export async function GET(req, ctx) {
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "exports") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const id = (await ctx.params).id;

  const r = await pool.query(
    "SELECT fichier, format FROM exports WHERE id=$1 AND restaurant_id=$2",
    [id, user.restaurantId]
  );
  const row = r.rows[0];
  if (!row) return json({ error: "Export introuvable" }, 404);

  // Path safety: the stored filename is joined against the export directory and
  // must remain inside it (no traversal out of var/exports).
  const target = path.join(EXPORT_DIR, path.basename(row.fichier));
  if (!target.startsWith(EXPORT_DIR) || !fs.existsSync(target)) {
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
