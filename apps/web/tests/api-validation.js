"use strict";
// TC-VAL — validation des entrées des routes API (SKILL-CODE § 6).
// Un identifiant ou une date mal formés doivent produire 404/400 et JAMAIS un
// 500 PostgreSQL (`invalid input syntax for type uuid|timestamp`).
// Rerun-safe : poste dédié POSTE-76, lignes de CE run retirées en fin de passage.
const { pool } = require("../lib/db");

const B = "http://127.0.0.1:3000";
const POSTE = "POSTE-76";
const BAD = "pas-un-uuid";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
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

const H = (cookie) => ({ "Content-Type": "application/json", Origin: B, Cookie: cookie });

async function expectStatus(label, method, path, cookie, body) {
  const r = await fetch(`${B}${path}`, {
    method,
    headers: H(cookie),
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const text = await r.text();
  check(label, r.status === 404, `${method} ${path} → ${r.status}${r.status === 404 ? "" : " " + text.slice(0, 60)}`);
}

async function main() {
  console.log("— Batterie TC-VAL (validation des entrées) —");
  const jar = await login("gerant@local.test", "Gerant123!");
  let deviceId = null;

  try {
    // Identifiant mal formé : 404, jamais 500.
    await expectStatus("TC-VAL-001", "PATCH", `/api/articles/${BAD}`, jar, { nom: "Test", prix_ttc: 1, taux_tva: 10 });
    await expectStatus("TC-VAL-002", "DELETE", `/api/articles/${BAD}`, jar);
    await expectStatus("TC-VAL-003", "GET", `/api/articles/${BAD}/photo`, jar);
    await expectStatus("TC-VAL-004", "POST", `/api/articles/${BAD}/photo`, jar, {});
    await expectStatus("TC-VAL-005", "PATCH", `/api/articles/${BAD}/photo`, jar, { media_id: UNKNOWN });
    await expectStatus("TC-VAL-006", "DELETE", `/api/articles/${BAD}/photo`, jar);
    await expectStatus("TC-VAL-007", "PATCH", `/api/categories/${BAD}`, jar, { nom: "Test" });
    await expectStatus("TC-VAL-008", "DELETE", `/api/categories/${BAD}`, jar);
    await expectStatus("TC-VAL-009", "DELETE", `/api/devices/${BAD}`, jar);
    await expectStatus("TC-VAL-010", "DELETE", `/api/tables/${BAD}`, jar);
    await expectStatus("TC-VAL-011", "PATCH", `/api/users-web/${BAD}`, jar, { actif: false });
    await expectStatus("TC-VAL-012", "DELETE", `/api/users-mobile/${BAD}`, jar);
    await expectStatus("TC-VAL-013", "DELETE", `/api/media/${BAD}`, jar);
    await expectStatus("TC-VAL-014", "GET", `/api/media/${BAD}/photo`, jar);
    await expectStatus("TC-VAL-015", "GET", `/api/exports/${BAD}`, jar);

    // UUID bien formé mais inexistant : 404 propre (pas d'erreur SQL).
    const unknown = await fetch(`${B}/api/tables/${UNKNOWN}`, { method: "DELETE", headers: H(jar) });
    check("TC-VAL-016", unknown.status === 404, `UUID inconnu → ${unknown.status}`);

    // `since` invalide : 400 explicite (pas 500) ; `since` valide : 200.
    const dev = await fetch(`${B}/api/devices`, { method: "POST", headers: H(jar), body: JSON.stringify({ poste: POSTE }) });
    const devBody = await dev.json();
    deviceId = devBody.device?.id || null;
    check("TC-VAL-017", dev.status === 201 && devBody.token, `jeton ${POSTE} créé → ${dev.status}`);

    if (devBody.token) {
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${devBody.token}` };
      const badSince = await fetch(`${B}/api/sync/pull?since=pas-une-date`, { method: "POST", headers: auth, body: "{}" });
      check("TC-VAL-018", badSince.status === 400, `since invalide → ${badSince.status}`);
      const okSince = await fetch(`${B}/api/sync/pull?since=2026-01-01`, { method: "POST", headers: auth, body: "{}" });
      check("TC-VAL-019", okSince.status === 200, `since valide → ${okSince.status}`);
    }
  } finally {
    // Artefacts de CE run uniquement (journal d'audit conservé).
    if (deviceId) await pool.query("DELETE FROM device_tokens WHERE id = $1", [deviceId]);
  }

  console.log(`\nTC-VAL : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("TC-VAL ERREUR :", e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
