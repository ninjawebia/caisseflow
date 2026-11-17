"use strict";
// Gestion des photos d'articles (backlog F2, PRD ch. 14.2) — DANS le conteneur.
// Stockage : répertoire uploads (volume Docker nommé, surchargeable par
// UPLOAD_DIR). Validation par MAGIC BYTES (jamais le Content-Type/nom client),
// taille ≤ 2 Mo, dimensions ≤ 2048 px, nom de fichier UUID généré côté serveur.
// Remplacement : l'ancienne photo est ARCHIVÉE (purge 30 j) — jamais écrasée.
// Aucune écriture journal_replica : traçabilité par audit_log uniquement.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo
const MAX_DIM = 2048; // px
const ALLOWED = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function uploadDir() {
  const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function detectImage(buf) {
  // JPEG : FF D8 FF — PNG : signature 8 octets — WebP : RIFF....WEBP
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "png";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" &&
      buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

// Dimensions décodées depuis les en-têtes (aucune dépendance externe).
function dimensions(buf, type) {
  try {
    if (type === "png") {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (type === "jpg") {
      // Parcours des marqueurs SOFn : hauteur/width codés sur 16 bits BE.
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
    if (type === "webp") {
      const fourcc = buf.slice(12, 16).toString("ascii");
      if (fourcc === "VP8X") {
        // canvas 1 pixel de moins que la valeur stockée (24 bits LE)
        const w = 1 + ((buf[24] | (buf[25] << 8) | (buf[26] << 16)));
        const h = 1 + ((buf[27] | (buf[28] << 8) | (buf[29] << 16)));
        return { w, h };
      }
      if (fourcc === "VP8 ") {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
      return null; // VP8L non supporté pour la vérification de dimensions
    }
  } catch {
    return null;
  }
  return null;
}

// Validation complète : { ok, ext, hash } | { ok:false, error }
function validate(buffer) {
  if (!buffer || buffer.length === 0) return { ok: false, error: "Fichier vide" };
  if (buffer.length > MAX_BYTES) return { ok: false, error: "Photo trop volumineuse (2 Mo maximum)" };
  const type = detectImage(buffer);
  if (!type) return { ok: false, error: "Format non autorisé — JPEG, PNG ou WebP uniquement" };
  const dim = dimensions(buffer, type);
  if (!dim) return { ok: false, error: "Dimensions illisibles — JPEG (baseline/progressif), PNG ou WebP (VP8/VP8X) requis" };
  if (dim.w > MAX_DIM || dim.h > MAX_DIM) return { ok: false, error: `Dimensions excessives (max ${MAX_DIM} px)` };
  return { ok: true, ext: type, hash: crypto.createHash("sha256").update(buffer).digest("hex"), w: dim.w, h: dim.h };
}

// Écriture : nom UUID serveur (jamais le nom client — injection de chemin/XSS).
function save(buffer, ext) {
  const dir = uploadDir();
  const file = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  return file;
}

// L'ancienne photo est déplacée vers uploads/archived/ (rétention 30 jours) —
// purge des fichiers trop vieux à chaque passage.
function archive(file) {
  if (!file) return;
  const dir = uploadDir();
  const src = path.join(dir, file);
  if (!fs.existsSync(src)) return;
  const archDir = path.join(dir, "archived");
  fs.mkdirSync(archDir, { recursive: true });
  const until = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  fs.renameSync(src, path.join(archDir, `${until}-${file}`));
  // Purge des archives expirées (30 j)
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  for (const f of fs.readdirSync(archDir)) {
    const stamp = f.slice(0, 10);
    const t = new Date(stamp).getTime();
    if (Number.isFinite(t) && t < cutoff) fs.unlinkSync(path.join(archDir, f));
  }
}

function pathOf(file) {
  return path.join(uploadDir(), file);
}

module.exports = { validate, save, archive, pathOf, uploadDir, detectImage, MAX_BYTES, MAX_DIM, ALLOWED };
