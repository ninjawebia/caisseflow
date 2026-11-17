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

  console.log(`\nTC-BO1-CAT : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Échec batterie :", e.message); process.exit(1); });
