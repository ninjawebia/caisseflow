import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";
import { licenceGate } from "../../../lib/license";
import { validate, save, ALLOWED } from "../../../lib/uploads";

// GET /api/media — bibliothèque média du restaurant (tout le personnel
// connecté en lecture). Chaque asset porte le nombre d'articles qui
// l'utilisent (photo_file dénormalisé) — badge « Utilisée ×n » dans l'UI.
export async function GET() {
  const user = await getSessionUser(await cookies());
  if (!user || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const r = await pool.query(
    `SELECT m.id, m.hash, m.mime, m.bytes, m.width, m.height, m.created_at,
            COUNT(a.id)::int AS nb_articles
     FROM media m
     LEFT JOIN articles a ON a.photo_file = m.file AND a.restaurant_id = m.restaurant_id
     WHERE m.restaurant_id = $1
     GROUP BY m.id ORDER BY m.created_at DESC`,
    [user.restaurantId]
  );
  return json({ media: r.rows });
}

// POST /api/media — téléversement direct dans la bibliothèque (gérant only,
// gate licence). Déduplication par hash : un contenu déjà présent est réutilisé
// (aucun nouveau fichier, aucune nouvelle ligne) → 200 {dedup:true}.
// Validation magic bytes + taille + dimensions (comme les photos d'articles).
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Requête multipart invalide" }, 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Champ « file » manquant" }, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const v = validate(buf);
  if (!v.ok) return json({ error: v.error }, 400);

  // Déduplication : le même contenu (hash) dans le même restaurant réutilise
  // l'asset existant — la bibliothèque ne grossit jamais avec des doublons.
  const dup = await pool.query(
    "SELECT id, hash, mime, bytes, width, height FROM media WHERE restaurant_id = $1 AND hash = $2",
    [user.restaurantId, v.hash]
  );
  if (dup.rows[0]) {
    return json({ media: dup.rows[0], dedup: true }, 200);
  }

  const name = save(buf, v.ext);
  const ins = await pool.query(
    `INSERT INTO media (restaurant_id, file, hash, mime, bytes, width, height, created_by_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, hash, mime, bytes, width, height`,
    [user.restaurantId, name, v.hash, ALLOWED[v.ext], buf.length, v.w, v.h, user.email]
  );
  await audit(user, "media_upload", "media", ins.rows[0].id, { hash: v.hash.slice(0, 12), size: buf.length });
  return json({ media: ins.rows[0] }, 201);
}
