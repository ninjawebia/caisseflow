import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../lib/auth";
import { pool } from "../../../../lib/db";
import { exportFilePath } from "../../../../lib/exports";
import { isUuid } from "../../../../lib/validate";
import fs from "fs";
import path from "path";

// Une réponse d'erreur (410/404) sans Cache-Control est mise en cache
// heuristiquement par le navigateur : un ancien 410 « Fichier d'export
// indisponible » continuait d'être servi après le correctif. Tout est no-store.
const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

const fail = (error, status) => Response.json({ error }, { status, headers: NO_STORE });

// GET /api/exports/[id] — stream a generated export (owner restaurant only).
// Permission: exports (gérant, comptable, auditeur) — same as generation.
export async function GET(req, ctx) {
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "exports") || !user.restaurantId) return fail("Accès refusé", 403);
  const id = (await ctx.params).id;
  // Un identifiant mal formé ne doit jamais produire un 500 PostgreSQL
  // (`invalid input syntax for type uuid`) : il est traité comme introuvable.
  if (!isUuid(id)) {
    return fail("Export introuvable", 404);
  }

  const r = await pool.query(
    "SELECT fichier, format FROM exports WHERE id=$1 AND restaurant_id=$2",
    [id, user.restaurantId]
  );
  const row = r.rows[0];
  if (!row) return fail("Export introuvable", 404);

  // Path safety: the stored filename is basename-only and resolved against the
  // SAME directory used by POST (lib/exports.js) — no traversal possible.
  const target = exportFilePath(row.fichier);
  if (!target || !fs.existsSync(target)) {
    return fail("Fichier d'export indisponible", 410);
  }

  const mime = row.format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8";
  const body = fs.readFileSync(target, "utf8");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": 'attachment; filename="' + path.basename(row.fichier) + '"',
      ...NO_STORE,
    },
  });
}
