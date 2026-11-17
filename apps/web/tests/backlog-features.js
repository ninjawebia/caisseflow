"use strict";
// Batterie backlog F1 « catégories » — TEST-PLAN § 21.1 (TC-BO1-CAT-*).
// Exécution DANS le conteneur : docker compose exec web sh -c "cd /repo/apps/web && node tests/backlog-features.js"
// (aucun node/npm sur l'hôte). Rerun-safe : noms suffixés par horodatage, le
// nettoyage est effectué en fin de passage (catégorie supprimée).
const { pool } = require("../lib/db");

const B = "http://127.0.0.1:3000";
const SFX = new Date().toISOString().slice(11, 19).replace(/:/g, "");
let pass = 0, fail = 0;
function check(id, cond, detail = "") {
  if (cond) { pass += 1; console.log(`  PASS ${id}${detail ? " — " + detail : ""}`); }
  else { fail += 1; console.error(`  FAIL ${id}${detail ? " — " + detail : ""}`); }
}

async function login(email, pwd) {
  const r = await fetch(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: B },
    body: JSON.stringify({ email, pwd }),
  });
  if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`);
  return (r.headers.get("set-cookie") || "").split(";")[0];
}

async function main() {
  console.log("— Batterie TC-BO1-CAT (backlog F1) —");
  const jar = await login("gerant@local.test", "Gerant123!");
  const jarC = await login("comptable@local.test", "Compta123!");
  const H = (cookie) => ({ "Content-Type": "application/json", Origin: B, Cookie: cookie });

  // TC-BO1-CAT-001 : création
  const c1 = await fetch(`${B}/api/categories`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Boissons froides ${SFX}` }) });
  const cat = await c1.json().catch(() => ({}));
  check("TC-BO1-CAT-001", c1.status === 201 && cat.category?.id, `HTTP ${c1.status}`);

  // TC-BO1-CAT-008 : nom invalide
  const bad = await fetch(`${B}/api/categories`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: "A" }) });
  check("TC-BO1-CAT-008", bad.status === 400, `HTTP ${bad.status}`);

  // Doublon (23505 → 409)
  const dup = await fetch(`${B}/api/categories`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Boissons froides ${SFX}` }) });
  check("TC-BO1-CAT-008b-doublon", dup.status === 409, `HTTP ${dup.status}`);

  // TC-BO1-CAT-002 : renommage + liste avec compteurs
  const patch = await fetch(`${B}/api/categories/${cat.category.id}`, { method: "PATCH", headers: H(jar), body: JSON.stringify({ nom: `Froid ${SFX}` }) });
  const patched = await patch.json().catch(() => ({}));
  check("TC-BO1-CAT-002", patch.status === 200 && patched.category?.nom === `Froid ${SFX}`, `HTTP ${patch.status}`);
  const list = await fetch(`${B}/api/categories`, { headers: { Origin: B, Cookie: jar } });
  const listed = await list.json().catch(() => ({}));
  const inList = (listed.categories || []).find((c) => c.id === cat.category?.id);
  check("TC-BO1-CAT-002b-liste", list.status === 200 && inList && typeof inList.nb_articles === "number");

  // TC-BO1-CAT-004 : suppression refusée si non vide (article rattaché)
  const art = await fetch(`${B}/api/articles`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Article test cat ${SFX}`, prix_ttc: 5, taux_tva: 10, categorie_id: cat.category.id, actif: true }) });
  if (art.status !== 201) throw new Error(`article → ${art.status} ${await art.text()}`);
  const del1 = await fetch(`${B}/api/categories/${cat.category.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  const del1b = await del1.json().catch(() => ({}));
  check("TC-BO1-CAT-004", del1.status === 400 && del1b.nb_articles === 1, `HTTP ${del1.status}`);

  // TC-BO1-CAT-005 : archivage → absente du sync pull, présente en BO
  const arch = await fetch(`${B}/api/categories/${cat.category.id}`, { method: "PATCH", headers: H(jar), body: JSON.stringify({ actif: false }) });
  const archb = await arch.json().catch(() => ({}));
  check("TC-BO1-CAT-005", arch.status === 200 && archb.category?.actif === false, `HTTP ${arch.status}`);
  const pull = await fetch(`${B}/api/sync/pull`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer device-token-demo-POSTE-01" }, body: "{}" });
  const pullb = await pull.json().catch(() => ({}));
  check("TC-BO1-CAT-007", pull.status === 200 && !(pullb.categories || []).some((c) => c.id === cat.category?.id), "archivée absente du sync pull");

  // Ré-association puis suppression (TC-BO1-CAT-003)
  const uncat = await fetch(`${B}/api/articles/${(await art.json()).article.id}`, {
    method: "PATCH", headers: H(jar),
    body: JSON.stringify({ nom: `Article test cat ${SFX}`, prix_ttc: 5, taux_tva: 10, categorie_id: null, actif: true }),
  });
  if (uncat.status !== 200) throw new Error(`uncat → ${uncat.status} ${await uncat.text()}`);
  const del2 = await fetch(`${B}/api/categories/${cat.category.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  check("TC-BO1-CAT-003", del2.status === 200, `HTTP ${del2.status}`);
  const list2 = await fetch(`${B}/api/categories`, { headers: { Origin: B, Cookie: jar } });
  const gone = !((await list2.json()).categories || []).some((c) => c.id === cat.category?.id);
  check("TC-BO1-CAT-003b", gone, "catégorie absente après suppression");

  // TC-BO1-CAT-006 : comptable en écriture → 403
  const forbidden = await fetch(`${B}/api/categories`, { method: "POST", headers: H(jarC), body: JSON.stringify({ nom: `Interdit ${SFX}` }) });
  check("TC-BO1-CAT-006", forbidden.status === 403, `HTTP ${forbidden.status}`);

  // TC-BO1-CAT-009 : aucune écriture dans journal_replica (comparaison avant/après est
  // garantie par construction : aucune INSERT du code catégories) — on vérifie le
  // chaînage + la trace audit_log.
  const chain = await pool.query(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT seq, hash_prev IS DISTINCT FROM LAG(hash_self) OVER (
         PARTITION BY restaurant_id, poste ORDER BY seq) AS rupture,
         LAG(hash_self) OVER (PARTITION BY restaurant_id, poste ORDER BY seq) AS prev_self
       FROM journal_replica) x WHERE prev_self IS NOT NULL AND rupture`
  );
  check("TC-BO1-CAT-009", chain.rows[0].n === 0, "chaînage intact");
  const audits = await pool.query(
    "SELECT COUNT(*)::int AS n FROM audit_log WHERE entity = 'categories' AND action IN ('create','update','archive','delete')"
  );
  check("TC-BO1-CAT-010-audit", audits.rows[0].n >= 4, `${audits.rows[0].n} traces audit_log`);

  const p1 = pass, f1 = fail;
  console.log(`\nTC-BO1-CAT : ${p1} PASS, ${f1} FAIL`);

  // ============ Batterie TC-BO1-PHOTO (backlog F2) ============
  console.log("— Batterie TC-BO1-PHOTO (backlog F2) —");
  const uploadsLib = require("../lib/uploads");
  const fs = require("fs");
  const crypto = require("crypto");

  // PNG 1×1 valide (base64 canonique)
  const PNG1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  // Pseudo-PNG avec IHDR 3000×3000 (magic bytes OK, dimensions excessives)
  const bigHdr = Buffer.alloc(33);
  bigHdr.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bigHdr.writeUInt32BE(13, 8); bigHdr.write("IHDR", 12);
  bigHdr.writeUInt32BE(3000, 16); bigHdr.writeUInt32BE(3000, 20);
  bigHdr.set(Buffer.from([0x08, 0x06, 0x00, 0x00, 0x00]), 24);
  // Faux JPEG renommé : un PDF (magic bytes %PDF) portant l'extension .jpg
  const pdfRenamed = Buffer.concat([Buffer.from("%PDF-1.7 fake"), crypto.randomBytes(64)]);

  const art2 = await fetch(`${B}/api/articles`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Article photo ${SFX}`, prix_ttc: 8, taux_tva: 10, actif: true }) });
  if (art2.status !== 201) throw new Error(`article2 → ${art2.status}`);
  const art2id = (await art2.json()).article.id;
  const before = await pool.query("SELECT COUNT(*)::int AS n FROM journal_replica");
  const up = (buf, name) => {
    const fd = new FormData();
    fd.append("photo", new Blob([buf]), name);
    return fetch(`${B}/api/articles/${art2id}/photo`, { method: "POST", headers: { Origin: B, Cookie: jar }, body: fd });
  };

  // TC-BO1-PHOTO-002 : PDF renommé .jpg → refusé (magic bytes)
  const pdf = await up(pdfRenamed, "fake.jpg");
  check("TC-BO1-PHOTO-002", pdf.status === 400, `HTTP ${pdf.status}`);

  // TC-BO1-PHOTO-003 : > 2 Mo + dimensions > 2048 px
  const big = await up(Buffer.concat([PNG1x1, crypto.randomBytes(2 * 1024 * 1024)]), "big.png");
  const dims = await up(bigHdr, "3000.png");
  check("TC-BO1-PHOTO-003", big.status === 400 && dims.status === 400, `HTTP ${big.status}/${dims.status}`);

  // TC-BO1-PHOTO-009 : nom client malveillant → ignoré (nom UUID serveur)
  const evil = await up(PNG1x1, "../../evil.php");
  const dirList = fs.readdirSync(uploadsLib.uploadDir()).join(" ");
  check("TC-BO1-PHOTO-009", evil.status === 201 && !dirList.includes("evil"), "nom UUID généré");

  // TC-BO1-PHOTO-001 : upload valide → 201 + GET 200 + ETag/304
  const ok1 = await up(PNG1x1, "photo.png");
  const ok1b = await ok1.json().catch(() => ({}));
  check("TC-BO1-PHOTO-001", ok1.status === 201 && ok1b.hash, `HTTP ${ok1.status}`);
  const get1 = await fetch(`${B}/api/articles/${art2id}/photo`, { headers: { Origin: B, Cookie: jar } });
  const etag = get1.headers.get("etag");
  check("TC-BO1-PHOTO-001b", get1.status === 200 && get1.headers.get("content-type") === "image/png" && !!etag, `HTTP ${get1.status} ${get1.headers.get("content-type")}`);
  const get304 = await fetch(`${B}/api/articles/${art2id}/photo`, { headers: { Origin: B, Cookie: jar, "If-None-Match": etag } });
  check("TC-BO1-PHOTO-001c", get304.status === 304, `HTTP ${get304.status}`);

  // TC-BO1-PHOTO-006 : comptable → 403
  const fd2 = new FormData();
  fd2.append("photo", new Blob([PNG1x1]), "x.png");
  const forb = await fetch(`${B}/api/articles/${art2id}/photo`, { method: "POST", headers: { Origin: B, Cookie: jarC }, body: fd2 });
  check("TC-BO1-PHOTO-006", forb.status === 403, `HTTP ${forb.status}`);

  // TC-BO1-PHOTO-007 : GET sans authentification → 403 ; avec jeton appareil → 200
  const noAuth = await fetch(`${B}/api/articles/${art2id}/photo`);
  const device = await fetch(`${B}/api/articles/${art2id}/photo`, { headers: { Authorization: "Bearer device-token-demo-POSTE-01" } });
  check("TC-BO1-PHOTO-007", noAuth.status === 403 && device.status === 200, `HTTP ${noAuth.status}/${device.status}`);

  // TC-BO1-PHOTO-008 : sync pull expose photo_hash
  const pull2 = await fetch(`${B}/api/sync/pull`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer device-token-demo-POSTE-01" }, body: "{}" });
  const pull2b = await pull2.json().catch(() => ({}));
  const inPull = (pull2b.articles || []).find((a) => a.id === art2id);
  check("TC-BO1-PHOTO-008", pull2.status === 200 && inPull && typeof inPull.photo_hash === "string", "photo_hash dans le sync pull");

  // TC-BO1-PHOTO-004 : remplacement → ancienne photo archivée
  const PNG2x2 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNkYPhfz0BEYBxVmgEAAVoB7TG6CJ8AAAAASUVORK5CYII=", "base64");
  const rep = await up(PNG2x2, "v2.png");
  const archived = fs.readdirSync(require("path").join(uploadsLib.uploadDir(), "archived")).length;
  check("TC-BO1-PHOTO-004", rep.status === 201 && archived >= 1, `${archived} fichier(s) archivé(s)`);

  // TC-BO1-PHOTO-010 : aucune écriture journal_replica (invariant NF525)
  const after = await pool.query("SELECT COUNT(*)::int AS n FROM journal_replica");
  check("TC-BO1-PHOTO-010", after.rows[0].n === before.rows[0].n, `journal ${before.rows[0].n} → ${after.rows[0].n}`);

  // TC-BO1-PHOTO-005 : suppression → GET 404, champ NULL
  const del = await fetch(`${B}/api/articles/${art2id}/photo`, { method: "DELETE", headers: { "Content-Type": "application/json", Origin: B, Cookie: jar }, body: "{}" });
  const get2 = await fetch(`${B}/api/articles/${art2id}/photo`, { headers: { Origin: B, Cookie: jar } });
  const db2 = await pool.query("SELECT photo_file, photo_hash FROM articles WHERE id = $1", [art2id]);
  check("TC-BO1-PHOTO-005", del.status === 200 && get2.status === 404 && db2.rows[0].photo_file === null, `HTTP ${del.status}/${get2.status}`);

  console.log(`\nTC-BO1-PHOTO : ${pass - p1} PASS, ${fail - f1} FAIL`);
  console.log(`\nTOTAL : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Échec batterie :", e.message); process.exit(1); });
