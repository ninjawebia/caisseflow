"use strict";
// TC-EXP — génération ET téléchargement des exports fiscaux (BO-5, A10 §18-19).
// Régression du bug « Fichier d'export indisponible » : la génération écrivait
// dans output/exports alors que le téléchargement lisait apps/web/var/exports.
// Le test vérifie aussi l'empreinte SHA-256, les droits et le cas introuvable.
const crypto = require("crypto");
const fs = require("fs");
const { pool } = require("../lib/db");
const { EXPORT_DIR } = require("../lib/exports");

const B = "http://127.0.0.1:3000";
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

async function main() {
  console.log("— Batterie TC-EXP (exports fiscaux) —");
  const jarC = await login("comptable@local.test", "Compta123!");
  const jarG = await login("gerant@local.test", "Gerant123!");
  const jarA = await login("auditeur@local.test", "Audit123!");
  const jarAdmin = await login("admin@local.test", "Admin123!");

  // Génération d'un export journal CSV par le comptable.
  const gen = await fetch(`${B}/api/exports`, {
    method: "POST", headers: H(jarC),
    body: JSON.stringify({ type: "journal", format: "csv" }),
  });
  const genBody = await gen.json().catch(() => ({}));
  check("TC-EXP-001", gen.status === 201 && genBody.export?.id, `HTTP ${gen.status}`);
  const id = genBody.export && genBody.export.id;
  if (!id) throw new Error("aucun export généré");

  // Téléchargement : c'est le chemin qui était cassé (410).
  const dl = await fetch(`${B}/api/exports/${id}`, { headers: { Cookie: jarC } });
  const body = await dl.text();
  check("TC-EXP-002", dl.status === 200, `HTTP ${dl.status} (téléchargement)`);
  check("TC-EXP-003", /text\/csv/.test(dl.headers.get("content-type") || ""), dl.headers.get("content-type") || "sans content-type");
  check("TC-EXP-004", /attachment; filename="[^"]+\.csv"/.test(dl.headers.get("content-disposition") || ""), dl.headers.get("content-disposition") || "sans disposition");

  // Empreinte : EOF = EMPREINTE_SHA256;<hex> ; recalcul sur le payload exact.
  const marker = "EMPREINTE_SHA256;";
  const at = body.lastIndexOf(marker);
  const payload = at >= 0 ? body.slice(0, at) : "";
  const stamped = at >= 0 ? body.slice(at + marker.length).trim().split("\n")[0] : "";
  const recomputed = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  check("TC-EXP-005", Boolean(payload) && stamped === recomputed, `empreinte ${stamped.slice(0, 12)}…`);
  check("TC-EXP-006", /ref;type;timestamp/.test(payload), "en-tête CSV présent");

  // Droits : auditeur (lecture) OK, admin plateforme (sans restaurant) 403.
  const dlA = await fetch(`${B}/api/exports/${id}`, { headers: { Cookie: jarA } });
  check("TC-EXP-007", dlA.status === 200, `auditeur → HTTP ${dlA.status}`);
  const dlAdmin = await fetch(`${B}/api/exports/${id}`, { headers: { Cookie: jarAdmin } });
  check("TC-EXP-008", dlAdmin.status === 403, `admin → HTTP ${dlAdmin.status}`);

  // Export inconnu : 404 (pas une fuite ni un 410 trompeur).
  const missing = await fetch(`${B}/api/exports/00000000-0000-4000-8000-000000000000`, { headers: { Cookie: jarG } });
  check("TC-EXP-009", missing.status === 404, `inconnu → HTTP ${missing.status}`);

  // Identifiant mal formé : 404, jamais un 500 SQL.
  const badId = await fetch(`${B}/api/exports/pas-un-uuid`, { headers: { Cookie: jarG } });
  check("TC-EXP-010", badId.status === 404, `uuid invalide → HTTP ${badId.status}`);

  // Nettoyage : fichier + ligne de test (l'audit_log conserve la trace).
  const row = await pool.query("SELECT fichier FROM exports WHERE id=$1", [id]);
  if (row.rows[0]) {
    try { fs.unlinkSync(`${EXPORT_DIR}/${row.rows[0].fichier}`); } catch { /* déjà absent */ }
    await pool.query("DELETE FROM exports WHERE id=$1", [id]);
  }

  console.log(`\nTC-EXP : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
}

main().catch(async (e) => {
  console.error("TC-EXP ERREUR :", e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
