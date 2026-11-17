import { cookies } from "next/headers";
import { getSessionUser } from "../../../../../lib/auth";
import { pool } from "../../../../../lib/db";
import { json } from "../../../../../lib/http";
import fs from "fs";
import { detectImage, ALLOWED, pathOf } from "../../../../../lib/uploads";

// GET /api/media/[id]/photo — sert le fichier de la bibliothèque (vignettes du
// sélecteur, réutilisation). ETag = 16 premiers caractères du hash (304).
// Lecture : tout le personnel connecté du restaurant (jamais cross-tenant).
export async function GET(req, ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser(await cookies());
  if (!user || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const r = await pool.query(
    "SELECT file, hash FROM media WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurantId]
  );
  const m = r.rows[0];
  if (!m) return json({ error: "Média introuvable" }, 404);

  const etag = `"${m.hash.slice(0, 16)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=86400" } });
  }
  let buf;
  try {
    buf = fs.readFileSync(pathOf(m.file));
  } catch {
    return json({ error: "Fichier média introuvable" }, 404);
  }
  const type = detectImage(buf);
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": ALLOWED[type] || "application/octet-stream",
      "Content-Length": String(buf.length),
      ETag: etag,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
