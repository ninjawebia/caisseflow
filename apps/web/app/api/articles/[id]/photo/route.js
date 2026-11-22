import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../../../lib/auth";
import { pool } from "../../../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../../../lib/http";
import { licenceGate } from "../../../../../lib/license";
import { validate, save, ALLOWED } from "../../../../../lib/uploads";
import { ensureVariants } from "../../../../../lib/images";
import { photoResponse } from "../../../../../lib/photos";
import { isUuid } from "../../../../../lib/validate";

// GET /api/articles/[id]/photo — sert le fichier (session web OU jeton
// appareil). ?variant=thumb|card|full sert un dérivé WebP optimisé.
export async function GET(req, ctx) {
  const { id } = await ctx.params;
  return photoResponse(req, await cookies(), "articles", id, "Article introuvable");
}

// POST /api/articles/[id]/photo — upload/replace (gérant only, multipart).
// Validation magic bytes + taille + dimensions, nom UUID serveur, dérivés WebP
// générés immédiatement. Traçabilité audit_log — JAMAIS journal_replica (la
// gestion menu n'est pas un événement fiscal).
export async function POST(req, ctx) {
  const { id } = await ctx.params;
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);
  // Gate licence : écritures refusées si expirée/bloquée (lecture OK, LIC-4).
  const lic = await licenceGate(user.restaurantId);
  if (!lic.ok) return json({ error: lic.error }, 403);
  if (!isUuid(id)) return json({ error: "Article introuvable" }, 404);

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

  // Bibliothèque média : le contenu est DÉDUPLIQUÉ par hash — un fichier déjà
  // présent est réutilisé (aucun nouveau fichier stocké) ; sinon il est
  // enregistré ET ajouté à la bibliothèque. L'ancienne photo de l'article
  // n'est PAS archivée : elle reste un asset réutilisable de la bibliothèque.
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
  // Dérivés WebP (thumb/card/full) : générés AVANT de répondre, pour que le BO
  // et la tablette ne téléchargent jamais l'original.
  await ensureVariants(name);
  // `updated_at` est le curseur du pull DELTA : sans ce bump, une photo
  // ajoutée après la dernière synchro ne serait JAMAIS transmise à la tablette.
  await pool.query("UPDATE articles SET photo_file = $1, photo_hash = $2, updated_at = now() WHERE id = $3", [name, v.hash, id]);
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
  if (!isUuid(id)) return json({ error: "Article introuvable" }, 404);

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

  await ensureVariants(m.rows[0].file);
  await pool.query("UPDATE articles SET photo_file = $1, photo_hash = $2, updated_at = now() WHERE id = $3", [m.rows[0].file, m.rows[0].hash, id]);
  await audit(user, "photo_set", "articles", id, { media_id: body.media_id, hash: m.rows[0].hash.slice(0, 12), source: "bibliotheque" });
  return json({ ok: true, hash: m.rows[0].hash.slice(0, 12) });
}

// DELETE /api/articles/[id]/photo — gérant only ; DÉLIAISON simplement
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
  if (!isUuid(id)) return json({ error: "Article introuvable" }, 404);

  const r = await pool.query(
    "SELECT photo_file FROM articles WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurantId]
  );
  if (!r.rows[0]) return json({ error: "Article introuvable" }, 404);
  if (!r.rows[0].photo_file) return json({ error: "Aucune photo à supprimer" }, 404);

  await pool.query("UPDATE articles SET photo_file = NULL, photo_hash = NULL, updated_at = now() WHERE id = $1", [id]);
  await audit(user, "photo_delete", "articles", id, { note: "déliaison — asset conservé en bibliothèque" });
  return json({ ok: true });
}
