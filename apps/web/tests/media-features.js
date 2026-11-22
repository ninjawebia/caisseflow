"use strict";
// Batteries v0.4 :
//   TC-MED-* — bibliothèque média (dédup, réutilisation, garde-fous)
//   TC-TKT-* — aperçu du ticket (SSR /ticket-modele)
// Exécution DANS le conteneur : make test. Rerun-safe (noms suffixés).
const { pool } = require("../lib/db");
const uploadsLib = require("../lib/uploads");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const B = "http://127.0.0.1:3000";
const SFX = new Date().toISOString().slice(11, 19).replace(/:/g, "");
let pass = 0, fail = 0;
function check(id, cond, detail = "") {
  if (cond) { pass += 1; console.log(`  PASS ${id}${detail ? " — " + detail : ""}`); }
  else { fail += 1; console.error(`  FAIL ${id}${detail ? " — " + detail : ""}`); }
}

// Requête avec 1 ré-essai sur erreur 5xx : `next dev` (HMR) peut servir une
// requête à vide pendant la recompilation d'un module au démarrage à froid —
// artefact du serveur de développement uniquement (build production non
// concerné). Une seule tentative supplémentaire, jamais plus.
async function fetchR(url, opts = {}) {
  let r = await fetch(url, opts);
  if (r.status >= 500) {
    await new Promise((res) => setTimeout(res, 300));
    r = await fetch(url, opts);
  }
  return r;
}

const PNG1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
// Contenu UNIQUE par run (octets aléatoires en fin de fichier, hors signature
// IHDR) : MED-001 ne doit jamais retomber sur la déduplication d'un run
// précédent — MED-002, elle, teste la déduplication explicitement.
const pngUnique = (salt) => Buffer.concat([PNG1x1, crypto.createHash("sha256").update(`med-${salt}-${SFX}`).digest()]);
const PNG2x2 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNkYPhfz0BEYBxVmgEAAVoB7TG6CJ8AAAAASUVORK5CYII=", "base64");
const pdfRenamed = Buffer.concat([Buffer.from("%PDF-1.7 fake"), crypto.randomBytes(64)]);

async function login(email, pwd) {
  const r = await fetchR(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: B },
    body: JSON.stringify({ email, pwd }),
  });
  if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}

async function main() {
  console.log("— Batterie TC-MED (bibliothèque média) —");
  const jar = await login("gerant@local.test", "Gerant123!");
  const jarC = await login("comptable@local.test", "Compta123!");
  const H = (cookie) => ({ "Content-Type": "application/json", Origin: B, Cookie: cookie });
  // Warm-up : déclenche la compilation de /api/media (artefact possible après
  // un redémarrage du serveur de dev — jamais compté dans les assertions).
  await fetchR(`${B}/api/media`, { headers: { Origin: B, Cookie: jar } });
  const beforeMedia = (await pool.query("SELECT COUNT(*)::int AS n FROM media")).rows[0].n;
  const beforeFiles = fs.readdirSync(uploadsLib.uploadDir()).filter((f) => f !== "archived").length;

  // MED-001 : téléversement direct → 201, asset en base
  const up1 = (buf, name, cookie = jar) => {
    const fd = new FormData();
    fd.append("file", new Blob([buf]), name);
    return fetchR(`${B}/api/media`, { method: "POST", headers: { Origin: B, Cookie: cookie }, body: fd });
  };
  const u1 = await up1(pngUnique("a"), `lib-${SFX}.png`);
  const u1b = await u1.json().catch(() => ({}));
  check("TC-MED-001", u1.status === 201 && u1b.media?.id && u1b.media?.hash, `HTTP ${u1.status}`);
  const med1 = u1b.media;
  // v0.5 : chaque original reçoit 3 dérivés WebP (thumb/card/full) — on mesure
  // donc le dédoublonnage APRÈS ce premier envoi, pas avant.
  const afterFirstFiles = fs.readdirSync(uploadsLib.uploadDir()).filter((f) => f !== "archived").length;

  // MED-002 : DÉDUPLICATION — même contenu re-téléversé → même asset, 0 nouvelle ligne/fichier
  const u2 = await up1(pngUnique("a"), "dup.png");
  const u2b = await u2.json().catch(() => ({}));
  const afterDupMedia = (await pool.query("SELECT COUNT(*)::int AS n FROM media")).rows[0].n;
  const afterDupFiles = fs.readdirSync(uploadsLib.uploadDir()).filter((f) => f !== "archived").length;
  check("TC-MED-002",
    u2.status === 200 && u2b.dedup === true && u2b.media?.id === med1.id &&
      afterDupMedia === beforeMedia + 1 && afterDupFiles === afterFirstFiles,
    `HTTP ${u2.status}, dedup=${u2b.dedup}, Δlignes=${afterDupMedia - beforeMedia}, Δfichiers(dedup)=${afterDupFiles - afterFirstFiles}`);

  // MED-003 : fichier invalide (PDF renommé) → 400 magic bytes
  const u3 = await up1(pdfRenamed, "fake.jpg");
  check("TC-MED-003", u3.status === 400, `HTTP ${u3.status}`);

  // MED-004 : comptable → 403 (écriture bibliothèque réservée au gérant)
  const u4 = await up1(PNG2x2, "x.png", jarC);
  check("TC-MED-004", u4.status === 403, `HTTP ${u4.status}`);

  // MED-005 : liste avec compteurs d'usage
  const l1 = await fetchR(`${B}/api/media`, { headers: { Origin: B, Cookie: jar } });
  const l1b = await l1.json().catch(() => ({}));
  const inList = (l1b.media || []).find((m) => m.id === med1.id);
  check("TC-MED-005", l1.status === 200 && inList && typeof inList.nb_articles === "number", `HTTP ${l1.status}`);

  // MED-006 : SERVIR le média (vignette) + ETag/304
  const s1 = await fetchR(`${B}/api/media/${med1.id}/photo`, { headers: { Origin: B, Cookie: jar } });
  const etag = s1.headers.get("etag");
  const s2 = await fetchR(`${B}/api/media/${med1.id}/photo`, { headers: { Origin: B, Cookie: jar, "If-None-Match": etag } });
  check("TC-MED-006", s1.status === 200 && s1.headers.get("content-type") === "image/png" && s2.status === 304, `HTTP ${s1.status}/${s2.status}`);

  // MED-007 : réutilisation — article assigné via PATCH {media_id}
  const art = await fetchR(`${B}/api/articles`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Article biblio ${SFX}`, prix_ttc: 4, taux_tva: 10, actif: true }) });
  if (art.status !== 201) throw new Error(`article → ${art.status}`);
  const artId = (await art.json()).article.id;
  const as1 = await fetchR(`${B}/api/articles/${artId}/photo`, { method: "PATCH", headers: H(jar), body: JSON.stringify({ media_id: med1.id }) });
  const as1b = await as1.json().catch(() => ({}));
  const dbArt = (await pool.query("SELECT photo_file, photo_hash FROM articles WHERE id = $1", [artId])).rows[0];
  check("TC-MED-007", as1.status === 200 && as1b.hash?.slice(0, 12) === med1.hash.slice(0, 12) && dbArt.photo_file !== null, `HTTP ${as1.status}`);
  const getArt = await fetchR(`${B}/api/articles/${artId}/photo`, { headers: { Origin: B, Cookie: jar } });
  check("TC-MED-007b-photo-serve", getArt.status === 200 && getArt.headers.get("content-type") === "image/png", `HTTP ${getArt.status}`);

  // MED-008 : DÉLIAISON (DELETE photo) → asset CONSERVÉ, fichier toujours sur disque
  const d1 = await fetchR(`${B}/api/articles/${artId}/photo`, { method: "DELETE", headers: H(jar), body: "{}" });
  const keep = (await pool.query("SELECT COUNT(*)::int AS n FROM media WHERE id = $1", [med1.id])).rows[0].n;
  const fileKept = fs.existsSync(uploadsLib.pathOf(dbArt.photo_file));
  check("TC-MED-008", d1.status === 200 && keep === 1 && fileKept, "asset réutilisable après déliaison");

  // MED-009 : suppression d'un asset UTILISÉ → 400 avec nb_articles
  await fetchR(`${B}/api/articles/${artId}/photo`, { method: "PATCH", headers: H(jar), body: JSON.stringify({ media_id: med1.id }) });
  const del1 = await fetchR(`${B}/api/media/${med1.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  const del1b = await del1.json().catch(() => ({}));
  check("TC-MED-009", del1.status === 400 && del1b.nb_articles >= 1, `HTTP ${del1.status}`);

  // MED-010 : suppression d'un asset LIBRE → 200, fichier archivé, ligne supprimée
  // (contenu UNIQUE au run : jamais partagé avec un article des runs précédents)
  const u5 = await up1(pngUnique("b"), `lib2-${SFX}.png`);
  if (u5.status !== 201) throw new Error(`med5 → ${u5.status} (attendu 201, contenu unique)`);
  const med5 = (await u5.json()).media;
  const del2 = await fetchR(`${B}/api/media/${med5.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  const gone = (await pool.query("SELECT COUNT(*)::int AS n FROM media WHERE id = $1", [med5.id])).rows[0].n;
  const archDir = path.join(uploadsLib.uploadDir(), "archived");
  const archived = fs.existsSync(archDir) ? fs.readdirSync(archDir).length : 0;
  check("TC-MED-010", del2.status === 200 && gone === 0 && archived >= 1, `HTTP ${del2.status}, ${archived} archivé(s)`);

  // MED-011 : assignation d'un média inconnu → 404
  const as2 = await fetchR(`${B}/api/articles/${artId}/photo`, { method: "PATCH", headers: H(jar), body: JSON.stringify({ media_id: crypto.randomUUID() }) });
  check("TC-MED-011", as2.status === 404, `HTTP ${as2.status}`);

  // MED-012 : traçabilité audit_log
  const au = await pool.query("SELECT COUNT(*)::int AS n FROM audit_log WHERE action IN ('media_upload','media_delete')");
  check("TC-MED-012-audit", au.rows[0].n >= 2, `${au.rows[0].n} traces media_*`);

  // Nettoyage : délier l'article de test (l'asset reste en bibliothèque)
  await fetchR(`${B}/api/articles/${artId}`, { method: "DELETE", headers: H(jar), body: "{}" });

  // ============ TC-TKT — aperçu du ticket (SSR) ============
  console.log("— Batterie TC-TKT (aperçu du ticket) —");
  const page = await fetchR(`${B}/ticket-modele`, { headers: { Origin: B, Cookie: jar } });
  const html = await page.text();
  check("TC-TKT-001-preview", page.status === 200 && html.includes("ticket-preview") && html.includes("Aperçu du ticket"), "composant présent");
  check("TC-TKT-002-legales", html.includes("RÉCAP TVA") && html.includes("TOTAL TTC") && html.includes("Empreinte"), "mentions NF525 dans l'aperçu");
  const logo = `Marque ${SFX}`;
  const save1 = await fetchR(`${B}/api/ticket-template`, { method: "PATCH", headers: H(jar), body: JSON.stringify({ logo_text: logo, mentions: `Merci ${SFX}` }) });
  const html2 = await (await fetchR(`${B}/ticket-modele`, { headers: { Origin: B, Cookie: jar } })).text();
  check("TC-TKT-003-reflet-sauvegarde", save1.status === 200 && html2.includes(logo.toUpperCase()) && html2.includes(`Merci ${SFX}`), "aperçu reflète le modèle enregistré");

  console.log(`\nTC-MED : ${pass} PASS, ${fail} FAIL`);
  console.log(`TOTAL : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Échec batterie :", e.message); process.exit(1); });
