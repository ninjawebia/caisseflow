"use strict";
// Batteries v0.5 — présentation des images :
//   TC-PRESET-*   styles réutilisables (CRUD, défaut unique, RBAC, garde-fous)
//   TC-CATPHOTO-* photos de catégories (upload, variantes, ETag, RBAC, 5 Mo)
//   TC-IMG-*      variantes WebP et cache
//   TC-SYNCMG-*   photo/style transmis à la tablette par le pull (dont DELTA)
// Exécution DANS le conteneur : make test. Rerun-safe (noms et contenus
// suffixés par run, lignes créées supprimées en fin de passage).
const { pool } = require("../lib/db");
const uploadsLib = require("../lib/uploads");
const crypto = require("crypto");
const fs = require("fs");
const sharp = require("sharp");

const B = "http://127.0.0.1:3000";
const SFX = new Date().toISOString().slice(11, 19).replace(/:/g, "");
let pass = 0, fail = 0;
function check(id, cond, detail = "") {
  if (cond) { pass += 1; console.log(`  PASS ${id}${detail ? " — " + detail : ""}`); }
  else { fail += 1; console.error(`  FAIL ${id}${detail ? " — " + detail : ""}`); }
}

// 1 ré-essai sur 5xx : artefact HMR de `next dev` au démarrage à froid.
async function fetchR(url, opts = {}) {
  let r = await fetch(url, opts);
  if (r.status >= 500) {
    await new Promise((res) => setTimeout(res, 300));
    r = await fetch(url, opts);
  }
  return r;
}

async function login(email, pwd) {
  const r = await fetchR(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: B },
    body: JSON.stringify({ email, pwd }),
  });
  if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}

// Photo réelle (décodable par sharp) — le contenu change à chaque run pour
// que la déduplication de la bibliothèque ne masque pas les assertions.
async function photoBuffer(width = 320, height = 240, salt = SFX) {
  return sharp({
    create: {
      width, height, channels: 3,
      background: { r: 180, g: 40, b: 60 },
    },
  }).jpeg({ quality: 80 }).toBuffer().then((buf) => Buffer.concat([
    buf,
    crypto.createHash("sha256").update(`img-${salt}-${width}x${height}`).digest(),
  ]));
}

const H = (cookie) => ({ "Content-Type": "application/json", Origin: B, Cookie: cookie });

async function main() {
  console.log("— Batterie TC-PRESET (styles d'image) —");
  const jar = await login("gerant@local.test", "Gerant123!");
  const jarC = await login("comptable@local.test", "Compta123!");
  await fetchR(`${B}/api/presets`, { headers: { Origin: B, Cookie: jar } }); // warm-up

  // --- RBAC + lecture ---
  const anon = await fetchR(`${B}/api/presets`, { headers: { Origin: B } });
  check("TC-PRESET-001-anon", anon.status === 403, `sans session → ${anon.status} (403 attendu)`);

  const list = await fetchR(`${B}/api/presets`, { headers: { Origin: B, Cookie: jar } });
  const listBody = await list.json().catch(() => ({}));
  const defaults = (listBody.presets || []).filter((p) => p.par_defaut);
  check("TC-PRESET-002-defauts",
    list.status === 200 && defaults.some((p) => p.contexte === "bo") && defaults.some((p) => p.contexte === "menu"),
    `${defaults.length} style(s) par défaut`);

  const readC = await fetchR(`${B}/api/presets`, { headers: { Origin: B, Cookie: jarC } });
  check("TC-PRESET-003-lecture-personnel", readC.status === 200, `comptable GET → ${readC.status}`);

  const writeC = await fetchR(`${B}/api/presets`, {
    method: "POST", headers: H(jarC),
    body: JSON.stringify({ nom: `Interdit ${SFX}`, forme: "carre", contexte: "menu" }),
  });
  check("TC-PRESET-004-ecriture-gerant", writeC.status === 403, `comptable POST → ${writeC.status} (403 attendu)`);

  // --- Validation serveur ---
  const invalids = [
    { nom: "X", forme: "carre" },
    { nom: `Forme ${SFX}`, forme: "losange" },
    { nom: `Ratio ${SFX}`, ratio: "21:9" },
    { nom: `Rayon ${SFX}`, rayon: 99 },
    { nom: `Ctx ${SFX}`, contexte: "inconnu" },
  ];
  let invalidOk = true;
  for (const body of invalids) {
    const r = await fetchR(`${B}/api/presets`, { method: "POST", headers: H(jar), body: JSON.stringify(body) });
    if (r.status !== 400) { invalidOk = false; console.error(`    ${body.nom} → ${r.status}`); }
  }
  check("TC-PRESET-005-validation", invalidOk, "5 charges invalides refusées en 400");

  // --- Création / modification / suppression ---
  const nom = `Style test ${SFX}`;
  const create = await fetchR(`${B}/api/presets`, {
    method: "POST", headers: H(jar),
    body: JSON.stringify({ nom, forme: "carre", cadrage: "cover", ratio: "4:3", rayon: 6, ombre: true, contexte: "menu" }),
  });
  const created = (await create.json().catch(() => ({}))).preset;
  check("TC-PRESET-006-create", create.status === 201 && created?.id && created?.rayon === 6, `HTTP ${create.status}`);

  const dupe = await fetchR(`${B}/api/presets`, {
    method: "POST", headers: H(jar), body: JSON.stringify({ nom, contexte: "menu" }),
  });
  check("TC-PRESET-007-nom-unique", dupe.status === 409, `doublon → ${dupe.status} (409 attendu)`);

  const renamed = `Style modifié ${SFX}`;
  const patch = await fetchR(`${B}/api/presets/${created.id}`, {
    method: "PATCH", headers: H(jar),
    body: JSON.stringify({ nom: renamed, forme: "cercle", cadrage: "contain", ratio: "1:1", rayon: 12, ombre: false, contexte: "menu" }),
  });
  check("TC-PRESET-008-patch", patch.status === 200, `HTTP ${patch.status}`);

  const patchCross = await fetchR(`${B}/api/presets/${created.id}`, {
    method: "PATCH", headers: H(jarC), body: JSON.stringify({ nom: "pirate" }),
  });
  check("TC-PRESET-009-patch-rbac", patchCross.status === 403, `comptable PATCH → ${patchCross.status}`);

  // --- Défaut unique par contexte ---
  const ticketA = await fetchR(`${B}/api/presets`, {
    method: "POST", headers: H(jar),
    body: JSON.stringify({ nom: `Ticket A ${SFX}`, forme: "bandeau", ratio: "16:9", contexte: "ticket", par_defaut: true }),
  });
  const ticketABody = await ticketA.json().catch(() => ({}));
  const ticketB = await fetchR(`${B}/api/presets`, {
    method: "POST", headers: H(jar),
    body: JSON.stringify({ nom: `Ticket B ${SFX}`, forme: "carre", ratio: "1:1", contexte: "ticket", par_defaut: true }),
  });
  const ticketBBody = await ticketB.json().catch(() => ({}));
  const nbDefautsTicket = (await pool.query(
    "SELECT COUNT(*)::int AS n FROM image_presets WHERE contexte = 'ticket' AND par_defaut"
  )).rows[0].n;
  check("TC-PRESET-010-defaut-unique",
    ticketA.status === 201 && ticketB.status === 201 && nbDefautsTicket === 1,
    `${nbDefautsTicket} défaut(s) ticket après deux créations`);

  // --- Garde-fous de suppression ---
  const menuDefault = (await pool.query(
    "SELECT id FROM image_presets WHERE contexte = 'menu' AND par_defaut LIMIT 1"
  )).rows[0];
  const delDefault = await fetchR(`${B}/api/presets/${menuDefault.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  check("TC-PRESET-011-defaut-protege", delDefault.status === 409, `suppression défaut → ${delDefault.status}`);

  const cat = await fetchR(`${B}/api/categories`, { headers: { Origin: B, Cookie: jar } });
  const catId = (await cat.json()).categories[0].id;
  const assigned = await fetchR(`${B}/api/categories/${catId}`, {
    method: "PATCH", headers: H(jar), body: JSON.stringify({ preset_id: created.id }),
  });
  const delUsed = await fetchR(`${B}/api/presets/${created.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  check("TC-PRESET-012-utilise-protege", assigned.status === 200 && delUsed.status === 409, `suppression utilisée → ${delUsed.status}`);

  // Style inconnu / d'un autre restaurant → 400 (jamais d'affectation croisée).
  const badPreset = await fetchR(`${B}/api/categories/${catId}`, {
    method: "PATCH", headers: H(jar), body: JSON.stringify({ preset_id: crypto.randomUUID() }),
  });
  check("TC-PRESET-013-style-inconnu", badPreset.status === 400, `preset inconnu → ${badPreset.status}`);

  await fetchR(`${B}/api/categories/${catId}`, { method: "PATCH", headers: H(jar), body: JSON.stringify({ preset_id: null }) });
  const delFree = await fetchR(`${B}/api/presets/${created.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  check("TC-PRESET-014-suppression-libre", delFree.status === 200, `suppression libre → ${delFree.status}`);

  const au = (await pool.query(
    "SELECT COUNT(*)::int AS n FROM audit_log WHERE action IN ('preset_create','preset_update','preset_delete')"
  )).rows[0].n;
  check("TC-PRESET-015-audit", au >= 3, `${au} traces de styles`);

  // ============ TC-CATPHOTO — photos de catégories ============
  console.log("— Batterie TC-CATPHOTO (photos de catégories) —");
  const catName = `Cat photo ${SFX}`;
  const catRes = await fetchR(`${B}/api/categories`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: catName }) });
  if (catRes.status !== 201) throw new Error(`catégorie de test → ${catRes.status}`);
  const newCat = (await catRes.json()).category;

  const upload = async (buf, cookie = jar, name = "photo.jpg") => {
    const fd = new FormData();
    fd.append("photo", new Blob([buf], { type: "image/jpeg" }), name);
    return fetchR(`${B}/api/categories/${newCat.id}/photo`, {
      method: "POST", headers: { Origin: B, Cookie: cookie }, body: fd,
    });
  };

  const big = await photoBuffer(320, 240, `${SFX}-big`);
  const up1 = await upload(big);
  const up1b = await up1.json().catch(() => ({}));
  check("TC-CATPHOTO-001-upload", up1.status === 201 && up1b.hash, `HTTP ${up1.status}`);

  const dbCat = (await pool.query(
    "SELECT photo_file, photo_hash, photo_updated_at FROM categories WHERE id = $1", [newCat.id]
  )).rows[0];
  check("TC-CATPHOTO-002-persist", !!dbCat.photo_file && !!dbCat.photo_hash && !!dbCat.photo_updated_at, "fichier + empreinte + date");

  // Variantes : trois tailles WebP, jamais l'original 5 Mo côté UI.
  const variants = ["thumb", "card", "full"];
  const sizes = {};
  const dims = {};
  let variantsOk = true;
  for (const v of variants) {
    const r = await fetchR(`${B}/api/categories/${newCat.id}/photo?variant=${v}`, { headers: { Origin: B, Cookie: jar } });
    const buf = Buffer.from(await r.arrayBuffer());
    sizes[v] = buf.length;
    if (!(r.status === 200 && r.headers.get("content-type") === "image/webp" && buf.length > 0)) { variantsOk = false; continue; }
    const meta = await sharp(buf).metadata();
    dims[v] = `${meta.width}x${meta.height}`;
  }
  // Vignette et carte sont des carrés recadrés ; « full » ne dépasse jamais
  // 1200 px et n'agrandit pas une source plus petite (sans perte ni poids).
  check("TC-CATPHOTO-003-variantes",
    variantsOk && dims.thumb === "160x160" && dims.card === "480x480" &&
      Number(dims.full.split("x")[0]) <= 1200 && sizes.thumb < sizes.card,
    `thumb ${dims.thumb} ${sizes.thumb} o · card ${dims.card} ${sizes.card} o · full ${dims.full} ${sizes.full} o`);

  const orig = await fetchR(`${B}/api/categories/${newCat.id}/photo`, { headers: { Origin: B, Cookie: jar } });
  check("TC-CATPHOTO-004-original-archive", orig.status === 200 && orig.headers.get("content-type") === "image/jpeg",
    `original ${(await orig.arrayBuffer()).byteLength} o (archivé, non servi à l'UI)`);

  const etag = orig.headers.get("etag");
  const reval = await fetchR(`${B}/api/categories/${newCat.id}/photo`, {
    headers: { Origin: B, Cookie: jar, "If-None-Match": etag },
  });
  const thumbEtag = (await fetchR(`${B}/api/categories/${newCat.id}/photo?variant=thumb`, {
    headers: { Origin: B, Cookie: jar },
  })).headers.get("etag");
  check("TC-CATPHOTO-005-etag", reval.status === 304 && !!etag && thumbEtag !== etag,
    `304 original, ETag variante distinct ${thumbEtag}`);

  // Sécurité : sans session → 403 ; comptable → 403 en écriture.
  const anonPhoto = await fetchR(`${B}/api/categories/${newCat.id}/photo?variant=thumb`, { headers: { Origin: B } });
  check("TC-CATPHOTO-006-anon", anonPhoto.status === 403, `sans session → ${anonPhoto.status}`);
  const upC = await upload(await photoBuffer(64, 64, `${SFX}-c`), jarC);
  check("TC-CATPHOTO-007-rbac", upC.status === 403, `comptable upload → ${upC.status}`);

  // 5 Mo : refus explicite (la limite a été portée de 2 à 5 Mo).
  const oversized = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(5 * 1024 * 1024)]);
  const upBig = await upload(oversized);
  const upBigBody = await upBig.json().catch(() => ({}));
  check("TC-CATPHOTO-008-5mo", upBig.status === 400 && /5 Mo/.test(upBigBody.error || ""), `HTTP ${upBig.status} — ${upBigBody.error}`);

  // PDF renommé → 400 (magic bytes, jamais le nom/Content-Type client).
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7 faux"), crypto.randomBytes(64)]);
  const upPdf = await upload(pdf, jar, "photo.jpg");
  check("TC-CATPHOTO-009-magic-bytes", upPdf.status === 400, `PDF renommé → ${upPdf.status}`);

  // Dimensions excessives (> 4096 px) → 400.
  const wide = await sharp({ create: { width: 4100, height: 8, channels: 3, background: "#123456" } }).png().toBuffer();
  const upWide = await upload(wide, jar, "large.png");
  const upWideBody = await upWide.json().catch(() => ({}));
  check("TC-CATPHOTO-010-dimensions", upWide.status === 400 && /4096/.test(upWideBody.error || ""), `HTTP ${upWide.status}`);

  // Bibliothèque : assigner un média existant à une catégorie.
  const mediaRow = (await pool.query(
    "SELECT id, hash FROM media WHERE restaurant_id = (SELECT restaurant_id FROM categories WHERE id = $1) LIMIT 1",
    [newCat.id]
  )).rows[0];
  const assign = await fetchR(`${B}/api/categories/${newCat.id}/photo`, {
    method: "PATCH", headers: H(jar), body: JSON.stringify({ media_id: mediaRow.id }),
  });
  const afterAssign = (await pool.query("SELECT photo_hash FROM categories WHERE id = $1", [newCat.id])).rows[0];
  check("TC-CATPHOTO-011-bibliotheque", assign.status === 200 && afterAssign.photo_hash === mediaRow.hash, `HTTP ${assign.status}`);

  const assignBad = await fetchR(`${B}/api/categories/${newCat.id}/photo`, {
    method: "PATCH", headers: H(jar), body: JSON.stringify({ media_id: crypto.randomUUID() }),
  });
  check("TC-CATPHOTO-012-media-inconnu", assignBad.status === 404, `média inconnu → ${assignBad.status}`);

  // Dé-liaison : l'asset reste dans la bibliothèque.
  const dell = await fetchR(`${B}/api/categories/${newCat.id}/photo`, { method: "DELETE", headers: H(jar), body: "{}" });
  const keepMedia = (await pool.query("SELECT COUNT(*)::int AS n FROM media WHERE id = $1", [mediaRow.id])).rows[0].n;
  const afterDel = (await pool.query("SELECT photo_file FROM categories WHERE id = $1", [newCat.id])).rows[0];
  check("TC-CATPHOTO-013-deliaison", dell.status === 200 && afterDel.photo_file === null && keepMedia === 1, "asset conservé");

  // ============ TC-SYNCMG — ce que la tablette reçoit ============
  console.log("— Batterie TC-SYNCMG (photo + style dans le pull) —");
  // On remet une photo et un style sur la catégorie de test.
  await upload(await photoBuffer(300, 200, `${SFX}-sync`));
  const style = (await pool.query(
    "SELECT id FROM image_presets WHERE contexte = 'menu' AND par_defaut LIMIT 1"
  )).rows[0];
  await fetchR(`${B}/api/categories/${newCat.id}`, {
    method: "PATCH", headers: H(jar), body: JSON.stringify({ preset_id: style.id }),
  });

  // Article de test avec photo : le pull DELTA doit le transmettre.
  const artName = `Article photo ${SFX}`;
  const artRes = await fetchR(`${B}/api/articles`, {
    method: "POST", headers: H(jar),
    body: JSON.stringify({ nom: artName, prix_ttc: 7.5, taux_tva: 10, categorie_id: newCat.id }),
  });
  const art = (await artRes.json()).article;
  const upArt = await fetchR(`${B}/api/articles/${art.id}/photo`, {
    method: "POST", headers: { Origin: B, Cookie: jar },
    body: (() => { const fd = new FormData(); fd.append("photo", new Blob([big]), "a.jpg"); return fd; })(),
  });

  // Appareil : jeton dédié, révoqué en fin de test.
  const dev = await fetchR(`${B}/api/devices`, { method: "POST", headers: H(jar), body: JSON.stringify({ poste: "POSTE-96" }) });
  const devBody = await dev.json();
  const bearer = { "Content-Type": "application/json", Authorization: `Bearer ${devBody.token}` };
  const since = new Date(Date.now() - 60000).toISOString();
  const pull = await fetchR(`${B}/api/sync/pull?since=${encodeURIComponent(since)}`, {
    method: "POST", headers: bearer, body: "{}",
  });
  const pullBody = await pull.json().catch(() => ({}));
  const catPull = (pullBody.categories || []).find((c) => c.id === newCat.id);
  const artPull = (pullBody.articles || []).find((a) => a.id === art.id);
  check("TC-SYNCMG-001-categorie",
    pull.status === 200 && catPull?.photo_hash && catPull?.preset?.forme === "arrondi",
    `photo=${catPull?.photo_hash?.slice(0, 8)} preset=${catPull?.preset?.forme}`);
  check("TC-SYNCMG-002-article-delta",
    upArt.status === 201 && artPull?.photo_hash && artPull?.preset?.rayon === 12,
    `photo=${artPull?.photo_hash?.slice(0, 8)} (bump updated_at)`);

  const imgPull = await fetchR(`${B}/api/categories/${newCat.id}/photo?variant=thumb`, {
    headers: { Authorization: `Bearer ${devBody.token}` },
  });
  check("TC-SYNCMG-003-jeton-image", imgPull.status === 200 && imgPull.headers.get("content-type") === "image/webp",
    `image avec jeton appareil → ${imgPull.status}`);

  await fetchR(`${B}/api/devices/${devBody.device.id}`, { method: "DELETE", headers: H(jar), body: "{}" });

  // Nettoyage des lignes créées par CE run (l'API ne supprime pas les
  // catégories non vides ; les assets média restent, comme en production).
  await pool.query("DELETE FROM articles WHERE id = $1", [art.id]);
  await pool.query("DELETE FROM categories WHERE id = $1", [newCat.id]);
  await pool.query("DELETE FROM image_presets WHERE nom LIKE $1", [`Ticket % ${SFX}`]);

  const files = fs.readdirSync(uploadsLib.uploadDir()).filter((f) => f !== "archived").length;
  check("TC-IMG-001-fichiers", files > 0, `${files} fichier(s) dans le volume uploads`);

  console.log(`\nTOTAL : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Échec batterie :", e.message); process.exit(1); });
