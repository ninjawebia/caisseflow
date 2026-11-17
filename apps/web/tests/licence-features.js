"use strict";
// Batterie « activation de licence par clé signée » — TEST-PLAN § 22 (TC-LIC-*).
// Exécution DANS le conteneur : make test. Rerun-safe : noms suffixés, état de
// la licence restauré en fin de passage (etat active, expires_at NULL).
const { pool } = require("../lib/db");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const lic = require("../lib/license");

const B = "http://127.0.0.1:3000";
const SFX = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const DEV_PRIV = fs.readFileSync(path.join(__dirname, "..", "..", "..", "infra", "keys", "dev", "private.pem"), "utf8");
let pass = 0, fail = 0;
function check(id, cond, detail = "") {
  if (cond) { pass += 1; console.log(`  PASS ${id}${detail ? " — " + detail : ""}`); }
  else { fail += 1; console.error(`  FAIL ${id}${detail ? " — " + detail : ""}`); }
}
const day = (offset) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);

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
  console.log("— Batterie TC-LIC (activation de licence par clé signée) —");
  const jar = await login("gerant@local.test", "Gerant123!");
  const jarC = await login("comptable@local.test", "Compta123!");
  const H = (cookie) => ({ "Content-Type": "application/json", Origin: B, Cookie: cookie });

  const rid = (await pool.query("SELECT restaurant_id FROM users_web WHERE email = 'gerant@local.test'")).rows[0].restaurant_id;
  const activate = (cle) => fetch(`${B}/api/licence/activate`, { method: "POST", headers: H(jar), body: JSON.stringify({ cle }) });

  // LIC-001 : clé valide → 200, licence active, expiration et plan enregistrés
  const k1 = lic.signLicense({ rid, exp: day(30), plan: "pro" }, DEV_PRIV);
  const a1 = await activate(k1);
  const a1b = await a1.json().catch(() => ({}));
  const row1 = (await pool.query("SELECT etat, expires_at::text, plan, cle_id FROM licences WHERE restaurant_id=$1", [rid])).rows[0];
  check("TC-LIC-001", a1.status === 200 && row1.etat === "active" && row1.plan === "pro" && row1.cle_id === lic.fingerprint(k1), `HTTP ${a1.status}, exp ${row1.expires_at?.slice(0, 10)}`);

  // LIC-002 : signature altérée → 400 (message explicite), état inchangé
  const bad = k1.slice(0, -4) + "AAAA";
  const a2 = await activate(bad);
  check("TC-LIC-002", a2.status === 400 && /signature/i.test((await a2.json().catch(() => ({}))).error || ""), `HTTP ${a2.status}`);

  // LIC-003 : clé d'un autre restaurant → 400
  const other = crypto.randomUUID();
  const k3 = lic.signLicense({ rid: other, exp: day(30), plan: "pro" }, DEV_PRIV);
  const a3 = await activate(k3);
  check("TC-LIC-003", a3.status === 400 && /autre restaurant/i.test((await a3.json().catch(() => ({}))).error || ""), `HTTP ${a3.status}`);

  // LIC-004 : clé expirée → 400
  const k4 = lic.signLicense({ rid, exp: day(-1), plan: "pro" }, DEV_PRIV);
  const a4 = await activate(k4);
  check("TC-LIC-004", a4.status === 400 && /expirée/i.test((await a4.json().catch(() => ({}))).error || ""), `HTTP ${a4.status}`);

  // LIC-005 : comptable → 403 (seul le gérant active)
  const a5 = await fetch(`${B}/api/licence/activate`, { method: "POST", headers: H(jarC), body: JSON.stringify({ cle: k1 }) });
  check("TC-LIC-005", a5.status === 403, `HTTP ${a5.status}`);

  // LIC-006 : réactivation (même clé, après restauration) → 200 (résumé mensuel)
  const a6 = await activate(k1);
  check("TC-LIC-006", a6.status === 200, `HTTP ${a6.status}`);

  // ——— Gate écritures : licence expirée en base (contournement direct SQL) ———
  await pool.query("UPDATE licences SET expires_at = CURRENT_DATE - 1 WHERE restaurant_id = $1", [rid]);

  const w1 = await fetch(`${B}/api/articles`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Bloc licence ${SFX}`, prix_ttc: 5, taux_tva: 10, actif: true }) });
  const w1b = await w1.json().catch(() => ({}));
  check("TC-LIC-007-ecriture-refusee", w1.status === 403 && /expirée/i.test(w1b.error || ""), `HTTP ${w1.status}`);

  const w2 = await fetch(`${B}/api/categories`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Bloc cat ${SFX}` }) });
  check("TC-LIC-008-categorie-refusee", w2.status === 403, `HTTP ${w2.status}`);

  const p1 = await fetch(`${B}/api/articles`, { method: "POST", headers: { Origin: B, Cookie: jar }, body: new FormData() });
  check("TC-LIC-009-photo-refusee", p1.status === 403, `HTTP ${p1.status}`);

  // Lecture OK pendant la licence expirée (LIC-4 : exports/jamais verrouillés)
  const r1 = await fetch(`${B}/api/categories`, { headers: { Origin: B, Cookie: jar } });
  check("TC-LIC-010-lecture-ok", r1.status === 200, `HTTP ${r1.status}`);

  // Sync tablette suspendu (licences expirée → pull 403)
  const s1 = await fetch(`${B}/api/sync/pull`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer device-token-demo-POSTE-01" }, body: "{}" });
  check("TC-LIC-011-sync-suspendu", s1.status === 403, `HTTP ${s1.status}`);

  // Restauration (expires_at futur) → écritures à nouveau autorisées
  // (date calculée en JS : la requête reste 100 % paramétrée)
  const in365 = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await pool.query("UPDATE licences SET expires_at = $2 WHERE restaurant_id = $1", [rid, in365]);
  const w3 = await fetch(`${B}/api/articles`, { method: "POST", headers: H(jar), body: JSON.stringify({ nom: `Repris licence ${SFX}`, prix_ttc: 6, taux_tva: 10, actif: true }) });
  const w3b = await w3.json().catch(() => ({}));
  check("TC-LIC-012-reprise-ecriture", w3.status === 201, `HTTP ${w3.status} (article ${w3b.article?.id ? "créé" : "?"})`);
  if (w3b.article?.id) {
    await fetch(`${B}/api/articles/${w3b.article.id}`, { method: "DELETE", headers: H(jar), body: "{}" });
  }

  // LIC-013 : trace audit de l'activation
  const au = await pool.query("SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'licence_activate'");
  check("TC-LIC-013-audit", au.rows[0].n >= 2, `${au.rows[0].n} traces licence_activate`);

  // Restauration de l'état démo (rerun-safe) : active, perpétuelle, plan nettoyé
  await pool.query("UPDATE licences SET expires_at = NULL, plan = NULL WHERE restaurant_id = $1", [rid]);

  console.log(`\nTC-LIC : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Échec batterie :", e.message); process.exit(1); });
