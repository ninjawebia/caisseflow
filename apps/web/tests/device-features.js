"use strict";
// Batterie « enrôlement des tablettes » — TEST-PLAN § 25 (TC-DEV-*).
// Exécution DANS le conteneur : make test.
// Rerun-safe : poste dédié POSTE-77, jeton aléatoire par run ; les lignes
// créées par CE run sont retirées en fin de passage (le produit, lui, ne
// supprime jamais une tablette : il la révoque).
const { pool } = require("../lib/db");
const crypto = require("crypto");

const B = "http://127.0.0.1:3000";
const POSTE = "POSTE-77";
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

async function main() {
  console.log("— Batterie TC-DEV (enrôlement tablette) —");
  const jar = await login("gerant@local.test", "Gerant123!");
  const jarC = await login("comptable@local.test", "Compta123!");
  const H = (cookie) => ({ "Content-Type": "application/json", Origin: B, Cookie: cookie });
  await fetchR(`${B}/api/devices`, { headers: { Origin: B, Cookie: jar } }); // warm-up

  const created = [];
  try {
    // --- Garde d'accès (RBAC « devices » = gérant seulement) ---
    const anon = await fetchR(`${B}/api/devices`, { headers: { Origin: B } });
    check("DEV-001", anon.status === 403, `GET sans session → ${anon.status} (attendu 403)`);

    const listC = await fetchR(`${B}/api/devices`, { headers: H(jarC) });
    check("DEV-002", listC.status === 403, `GET comptable → ${listC.status} (attendu 403)`);

    const postC = await fetchR(`${B}/api/devices`, { method: "POST", headers: H(jarC), body: JSON.stringify({ poste: POSTE }) });
    check("DEV-003", postC.status === 403, `POST comptable → ${postC.status} (attendu 403)`);

    // --- Validation du format de poste ---
    for (const bad of ["POSTE-1", "POSTE-100", "CAISSE-01", ""]) {
      const r = await fetchR(`${B}/api/devices`, { method: "POST", headers: H(jar), body: JSON.stringify({ poste: bad }) });
      check(`DEV-004[${bad || "vide"}]`, r.status === 400, `POST « ${bad} » → ${r.status} (attendu 400)`);
    }

    // --- Création : jeton 256 bits renvoyé UNE fois, stocké hashé ---
    const create = await fetchR(`${B}/api/devices`, { method: "POST", headers: H(jar), body: JSON.stringify({ poste: POSTE }) });
    const createdBody = await create.json().catch(() => ({}));
    const token = createdBody.token;
    const deviceId = createdBody.device && createdBody.device.id;
    if (deviceId) created.push(deviceId);
    check("DEV-005", create.status === 201, `POST gérant → ${create.status} (attendu 201)`);
    check("DEV-006", typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token), `jeton base64url 256 bits (${token ? token.length : 0} car.)`);
    check("DEV-007", createdBody.device && createdBody.device.poste === POSTE, `poste renvoyé = ${createdBody.device && createdBody.device.poste}`);

    const row = (await pool.query(
      `SELECT token_hash, actif FROM device_tokens
       WHERE restaurant_id = (SELECT restaurant_id FROM users_web WHERE email='gerant@local.test')
         AND poste = $1`, [POSTE]
    )).rows[0];
    const sha = crypto.createHash("sha256").update(String(token)).digest("hex");
    check("DEV-008", !!row && row.token_hash === sha, "jeton stocké HASHÉ (SHA-256), jamais en clair");
    check("DEV-009", !!row && row.actif === true, "nouvelle tablette active");
    check("DEV-010", !!row && row.token_hash !== token && !row.token_hash.includes(String(token).slice(0, 12)), "aucune trace du jeton en clair en base");

    const auditCreate = await pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'device_create' AND entity_id = $1`, [deviceId]
    );
    check("DEV-011", auditCreate.rowCount === 1, "audit device_create écrit");

    // --- Le jeton est utilisable, mais jamais relisible par l'API ---
    const list = await fetchR(`${B}/api/devices`, { headers: H(jar) });
    const listText = await list.text();
    check("DEV-012", list.status === 200 && listText.includes(POSTE), `GET gérant → ${list.status} et contient ${POSTE}`);
    check("DEV-013", !listText.includes(String(token)) && !listText.includes("token_hash"), "la liste ne divulgue ni le jeton ni son hash");

    const pull = await fetchR(`${B}/api/sync/pull`, {
      method: "POST", headers: { Origin: B, Authorization: `Bearer ${token}` }, body: "{}",
    });
    const pullBody = await pull.json().catch(() => ({}));
    check("DEV-014", pull.status === 200, `pull avec jeton → ${pull.status} (attendu 200)`);
    check("DEV-015",
      Array.isArray(pullBody.categories) && Array.isArray(pullBody.articles) && Array.isArray(pullBody.users),
      `données de référence : ${(pullBody.categories || []).length} catégories, ${(pullBody.articles || []).length} articles, ${(pullBody.users || []).length} matricules`);
    check("DEV-016",
      (pullBody.users || []).every((u) => u.pinHash && !("pin" in u)),
      "les PIN ne circulent que hashés (pinHash, jamais pin)");

    const push = await fetchR(`${B}/api/sync/push`, {
      method: "POST", headers: { Origin: B, Authorization: `Bearer ${token}` }, body: JSON.stringify({ entries: [] }),
    });
    check("DEV-017", push.status === 200, `push (lot vide) avec jeton → ${push.status} (attendu 200)`);

    // --- Un seul jeton actif par poste ---
    const dup = await fetchR(`${B}/api/devices`, { method: "POST", headers: H(jar), body: JSON.stringify({ poste: POSTE }) });
    const dupBody = await dup.json().catch(() => ({}));
    check("DEV-018", dup.status === 409, `ré-enrôlement du même poste → ${dup.status} (attendu 409)`);
    check("DEV-019", dupBody.device_id === deviceId, "le 409 pointe la tablette déjà active");

    // --- Révocation : immédiate, tracée, sans suppression ---
    const revokeC = await fetchR(`${B}/api/devices/${deviceId}`, { method: "DELETE", headers: H(jarC) });
    check("DEV-020", revokeC.status === 403, `DELETE comptable → ${revokeC.status} (attendu 403)`);

    const revoke = await fetchR(`${B}/api/devices/${deviceId}`, { method: "DELETE", headers: H(jar) });
    check("DEV-021", revoke.status === 200, `DELETE gérant → ${revoke.status} (attendu 200)`);

    const pullRevoked = await fetchR(`${B}/api/sync/pull`, {
      method: "POST", headers: { Origin: B, Authorization: `Bearer ${token}` }, body: "{}",
    });
    check("DEV-022", pullRevoked.status === 401, `pull après révocation → ${pullRevoked.status} (attendu 401)`);

    const pushRevoked = await fetchR(`${B}/api/sync/push`, {
      method: "POST", headers: { Origin: B, Authorization: `Bearer ${token}` }, body: JSON.stringify({ entries: [] }),
    });
    check("DEV-023", pushRevoked.status === 401, `push après révocation → ${pushRevoked.status} (attendu 401)`);

    const again = await fetchR(`${B}/api/devices/${deviceId}`, { method: "DELETE", headers: H(jar) });
    check("DEV-024", again.status === 404, `seconde révocation → ${again.status} (attendu 404, idempotence tracée)`);

    const kept = await pool.query("SELECT actif FROM device_tokens WHERE id = $1", [deviceId]);
    check("DEV-025", kept.rowCount === 1 && kept.rows[0].actif === false, "ligne conservée (actif=false) — jamais supprimée");

    const auditRevoke = await pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'device_revoke' AND entity_id = $1`, [deviceId]
    );
    check("DEV-026", auditRevoke.rowCount === 1, "audit device_revoke écrit");

    // --- Page back-office + navigation ---
    const page = await fetchR(`${B}/appareils`, { headers: { Cookie: jar } });
    const pageHtml = await page.text();
    check("DEV-027", page.status === 200 && pageHtml.includes("Enrôler une tablette"), `page /appareils gérant → ${page.status} avec formulaire`);
    check("DEV-028", pageHtml.includes('href="/appareils"'), "entrée de navigation « Appareils » visible pour le gérant");

    const pageC = await fetchR(`${B}/appareils`, { headers: { Cookie: jarC } });
    const pageCHtml = await pageC.text();
    check("DEV-029", pageC.status === 200 && pageCHtml.includes("Accès refusé (403)"), "page /appareils refusée au comptable (403 explicite)");
    check("DEV-030", !pageCHtml.includes('href="/appareils"'), "entrée « Appareils » absente de la nav du comptable");
  } finally {
    // Nettoyage des artefacts de CE run uniquement (poste POSTE-77).
    // Le journal d'audit est append-only (règles SQL) : ses lignes restent,
    // c'est voulu — aucun historique d'audit n'est effacé.
    if (created.length) {
      await pool.query("DELETE FROM sync_logs WHERE poste = $1", [POSTE]);
      await pool.query("DELETE FROM device_tokens WHERE id = ANY($1::uuid[])", [created]);
    }
  }

  console.log(`\nTC-DEV : ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
