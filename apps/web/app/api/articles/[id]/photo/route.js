import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../../lib/auth";
import { deviceAuth } from "../../../../../lib/device";
import { pool } from "../../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../../lib/http";
import { licenceGate } from "../../../../../lib/license";
import fs from "fs";
import { validate, save, detectImage, ALLOWED, pathOf } from "../../../../../lib/uploads";

// Chargement de l'article du restaurant courant (session web OU jeton appareil).
// Les tablettes lisent les photos via ce même endpoint (PRD 14.2, sync pull).
async function loadArticle(id, req) {
  const user = await getSessionUser(await cookies());
  if (user && user.restaurantId) return { article: null, user };
  const device = await deviceAuth(req);
  if (device) return { article: null, user: { restaurantId: device.restaurantId, role: "appareil", email: `device-${device.poste}` } };
  return { article: null, user: null };
}

// GET /api/articles/[id]/photo — sert le fichier (authentifié), ETag = SHA-256.
export async function GET(req, ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser(await cookies());
  let restaurantId = user?.restaurantId;
  if (!restaurantId) {
    const device = await deviceAuth(req);
    if (device) restaurantId = device.restaurantId;
  }
  if (!restaurantId) return json({ error: "Accès refusé" }, 403);

  const r = await pool.query(
    "SELECT photo_file, photo_hash FROM articles WHERE id = $1 AND restaurant_id = $2",
    [id, restaurantId]
  );
  const art = r.rows[0];
  if (!art || !art.photo_file) return json({ error: "Aucune photo" }, 404);

  const etag = `"${art.photo_hash?.slice(0, 16) || "1"}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=86400" } });
  }
  let buf;
  try {
    buf = fs.readFileSync(pathOf(art.photo_file));
  } catch {
    return json({ error: "Fichier photo introuvable" }, 404);
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

// POST /api/articles/[id]/photo — upload/replace (gérant only, multipart).
// Validation magic bytes + taille + dimensions (PRD 14.2), nom UUID serveur,
// ancienne photo archivée (rétention 30 j). Traçabilité audit_log — JAMAIS
// journal_replica (la gestion menu n'est pas un événement fiscal).
export async function POST(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  // Gate licence : écritures refusées si expirée/bloquée (lecture OK, LIC-4).
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);


  const r = await pool.query(
    "SELECT id FROM articles WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurantId]
  );
  if (!r.rows[0]) return json({ error: "Article introuvable" }, 404);

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Requête multipart invalide" }, 400);
  }
  const file = form.get("photo");
  if (!file || typeof file === "string") return json({ error: "Champ « photo » manquant" }, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const v = validate(buf);
  if (!v.ok) return json({ error: v.error }, 400);

  // Bibliothèque média (v0.4) : le contenu est DÉDUPLIQUÉ par hash — un
  // fichier déjà présent est réutilisé (aucun nouveau fichier stocké) ;
  // sinon il est enregistré ET ajouté à la bibliothèque. L'ancienne photo de
  // l'article n'est PAS archivée : elle reste un asset réutilisable de la
  // bibliothèque (le cycle de vie de l'asset est indépendant de l'article).
  const dup = await pool.query(
    "SELECT file, hash FROM media WHERE restaurant_id = $1 AND hash = $2",
    [user.restaurantId, v.hash]
  );
  let name;
  if (dup.rows[0]) {
    name = dup.rows[0].file;
  } else {
    name = save(buf, v.ext);
    await pool.query(
      `INSERT INTO media (restaurant_id, file, hash, mime, bytes, width, height, created_by_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (restaurant_id, hash) DO NOTHING`,
      [user.restaurantId, name, v.hash, ALLOWED[v.ext], buf.length, v.w, v.h, user.email]
    );
  }
  await pool.query("UPDATE articles SET photo_file = $1, photo_hash = $2 WHERE id = $3", [name, v.hash, id]);
  await audit(user, "photo_set", "articles", id, { hash: v.hash.slice(0, 12), size: buf.length, dedup: !!dup.rows[0] });
  return json({ ok: true, hash: v.hash.slice(0, 12) }, 201);
}

// PATCH /api/articles/[id]/photo — réutiliser un média de la bibliothèque
// (gérant only, JSON {media_id}). Le contenu est déjà en base : on pointe
// l'article dessus (photo_file/photo_hash dénormalisés) — aucune écriture
// disque. L'ancienne photo reste dans la bibliothèque.
export async function PATCH(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);

  const a = await pool.query(
    "SELECT id FROM articles WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurantId]
  );
  if (!a.rows[0]) return json({ error: "Article introuvable" }, 404);

  const body = await req.json().catch(() => null);
  if (!body?.media_id) return json({ error: "media_id manquant" }, 400);
  const m = await pool.query(
    "SELECT file, hash FROM media WHERE id = $1 AND restaurant_id = $2",
    [body.media_id, user.restaurantId]
  );
  if (!m.rows[0]) return json({ error: "Média introuvable dans la bibliothèque" }, 404);

  await pool.query("UPDATE articles SET photo_file = $1, photo_hash = $2 WHERE id = $3", [m.rows[0].file, m.rows[0].hash, id]);
  await audit(user, "photo_set", "articles", id, { media_id: body.media_id, hash: m.rows[0].hash.slice(0, 12), source: "bibliotheque" });
  return json({ ok: true, hash: m.rows[0].hash.slice(0, 12) });
}

// DELETE /api/articles/[id]/photo — gérant only ; DéLIAISON simplement
// (champ NULL) : l'asset reste dans la bibliothèque, réutilisable pour un autre
// article. La suppression DISQUE passe par /api/media/[id] (refusée si utilisée).
export async function DELETE(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  // Gate licence : écritures refusées si expirée/bloquée (lecture OK, LIC-4).
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);


  const r = await pool.query(
    "SELECT photo_file FROM articles WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurantId]
  );
  if (!r.rows[0]) return json({ error: "Article introuvable" }, 404);
  if (!r.rows[0].photo_file) return json({ error: "Aucune photo à supprimer" }, 404);

  await pool.query("UPDATE articles SET photo_file = NULL, photo_hash = NULL WHERE id = $1", [id]);
  await audit(user, "photo_delete", "articles", id, { note: "déliaison — asset conservé en bibliothèque" });
  return json({ ok: true });
}
