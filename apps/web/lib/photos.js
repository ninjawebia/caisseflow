"use strict";
// Service de photos (articles ET catégories) — une seule implémentation pour
// l'authentification, l'ETag, le cache et le choix de la variante :
//   ?variant=thumb|card|full  → dérivé WebP (BO, tablette)
//   absent                    → original (repli, téléchargement)
// Lecture : session web OU jeton appareil (la tablette n'a pas de cookie).
const fs = require("fs");
const { getSessionUser } = require("./auth");
const { deviceAuth } = require("./device");
const { pool } = require("./db");
const { json } = require("./http");
const { detectImage, ALLOWED, pathOf, VARIANTS } = require("./uploads");
const { variantPath } = require("./images");
const { isUuid } = require("./validate");

const TABLES = new Set(["articles", "categories"]);

async function resolveRestaurant(req, cookieJar) {
  const user = await getSessionUser(cookieJar);
  if (user?.restaurantId) return user.restaurantId;
  const device = await deviceAuth(req);
  return device ? device.restaurantId : null;
}

async function photoResponse(req, cookieJar, table, id, notFoundLabel) {
  if (!TABLES.has(table)) throw new Error(`Table photo inconnue: ${table}`);
  const restaurantId = await resolveRestaurant(req, cookieJar);
  if (!restaurantId) return json({ error: "Accès refusé" }, 403);
  if (!isUuid(id)) return json({ error: notFoundLabel }, 404);

  const r = await pool.query(
    `SELECT photo_file, photo_hash FROM ${table} WHERE id = $1 AND restaurant_id = $2`,
    [id, restaurantId]
  );
  const row = r.rows[0];
  if (!row || !row.photo_file) return json({ error: "Aucune photo" }, 404);

  const requested = new URL(req.url).searchParams.get("variant");
  const variant = VARIANTS.includes(requested) ? requested : null;
  const hash = (row.photo_hash || "1").slice(0, 16);
  const etag = `"${hash}-${variant || "orig"}"`;
  const cacheHeaders = { ETag: etag, "Cache-Control": "private, max-age=86400" };

  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  let file = pathOf(row.photo_file);
  let type = null;
  if (variant) {
    const derived = await variantPath(row.photo_file, variant);
    if (!derived.path) return json({ error: "Fichier photo introuvable" }, 404);
    file = derived.path;
    type = derived.type;
  }

  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return json({ error: "Fichier photo introuvable" }, 404);
  }
  const contentType = type || ALLOWED[detectImage(buf)] || "application/octet-stream";
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buf.length),
      "X-Content-Type-Options": "nosniff",
      ...cacheHeaders,
    },
  });
}

module.exports = { photoResponse };
