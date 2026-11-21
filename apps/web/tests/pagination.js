"use strict";
// TC-PAG — pagination des listes longues (BO). TEST-PLAN § 34.
// Exécution DANS le conteneur : make test. Aucune écriture : lecture seule,
// les bornes attendues sont recalculées depuis la base (donc rerun-safe).
const { pool } = require("../lib/db");
const { parsePage, pageCount, clampPage, rangeLabel, pageHref } = require("../lib/pagination");

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

async function page(path, cookie) {
  const r = await fetch(`${B}${path}`, { headers: { Cookie: cookie } });
  return { status: r.status, html: await r.text() };
}

function meta(html) {
  const grab = (name) => {
    const m = html.match(new RegExp(`data-${name}="(\\d+)"`));
    return m ? Number(m[1]) : null;
  };
  const range = html.match(/data-pagination-range[^>]*>([^<]+)</);
  return { page: grab("page"), pages: grab("pages"), range: range ? range[1] : null };
}

async function main() {
  console.log("— Batterie TC-PAG (pagination des listes) —");

  // --- 1. Calculs purs (source unique lib/pagination.js) ---
  check("TC-PAG-001",
    parsePage("3") === 3 && parsePage("0") === 1 && parsePage("-2") === 1 &&
    parsePage("abc") === 1 && parsePage(undefined) === 1,
    `parsePage sûr (3/0/-2/abc/absent)`);
  check("TC-PAG-002",
    pageCount(202, 20) === 11 && clampPage(999, 202, 20) === 11 && clampPage(0, 202, 20) === 1,
    `pages=11, page 999 → 11, page 0 → 1`);
  check("TC-PAG-003",
    pageHref("/journal", { q: "x y", type: "VENTE" }, 1) === "/journal?q=x+y&type=VENTE" &&
    pageHref("/journal", { q: "x y", type: "VENTE" }, 3).endsWith("page=3"),
    `filtres conservés, page=1 omise`);
  check("TC-PAG-004",
    rangeLabel(1, 20, 202) === "1–20 sur 202" &&
    rangeLabel(11, 20, 202) === "201–202 sur 202" &&
    rangeLabel(1, 20, 0) === "Aucun résultat",
    `bornes affichées exactes`);

  const jar = await login("gerant@local.test", "Gerant123!");
  const restaurantId = (await pool.query(
    "SELECT id FROM restaurants ORDER BY created_at LIMIT 1"
  )).rows[0].id;
  const journalCount = (await pool.query(
    "SELECT COUNT(*)::int AS n FROM journal_replica WHERE restaurant_id=$1", [restaurantId]
  )).rows[0].n;

  // --- 2. Journal : pages serveur, liens avec filtres, bornes ---
  const j1 = await page("/journal?page=1", jar);
  const m1 = meta(j1.html);
  check("TC-PAG-005", j1.status === 200 && m1.page === 1, `GET /journal?page=1 → ${j1.status}, page ${m1.page}`);

  const journalPages = pageCount(journalCount, 20);
  const j2 = await page("/journal?page=2", jar);
  const m2 = meta(j2.html);
  check("TC-PAG-006", j2.status === 200 && m2.page === 2 && m2.pages === journalPages,
    `GET /journal?page=2 → ${j2.status}, page ${m2.page}/${m2.pages} (attendu ${journalPages})`);

  const jFar = await page("/journal?page=999", jar);
  check("TC-PAG-007", jFar.status === 200 && meta(jFar.html).page === journalPages,
    `page 999 ramenée à la dernière (${journalPages})`);

  const jBad = await page("/journal?page=abc", jar);
  check("TC-PAG-008", jBad.status === 200 && meta(jBad.html).page === 1,
    `page invalide → page 1`);

  const jFiltered = await page("/journal?q=POSTE&type=PAIEMENT", jar);
  check("TC-PAG-009", jFiltered.status === 200 && jFiltered.html.includes('data-pagination'),
    `filtres + pagination cohabitent → ${jFiltered.status}`);

  // --- 3. Audit : 50 par page, bornes calculées sur le total filtré ---
  const auditCount = (await pool.query("SELECT COUNT(*)::int AS n FROM audit_log")).rows[0].n;
  const auditPages = pageCount(auditCount, 50);
  const a1 = await page("/audit", jar);
  const ma1 = meta(a1.html);
  check("TC-PAG-010", a1.status === 200 && ma1.page === 1 && ma1.pages === auditPages,
    `GET /audit → ${a1.status}, page 1/${ma1.pages} (attendu ${auditPages})`);
  const a2 = await page("/audit?page=2", jar);
  check("TC-PAG-011", a2.status === 200 && meta(a2.html).page === 2,
    `GET /audit?page=2 → ${a2.status}, page ${meta(a2.html).page}`);

  // --- 4. Menu : pagination côté client (recherche conservée sur toute la carte) ---
  const menu = await page("/menu", jar);
  const articles = (await pool.query(
    "SELECT COUNT(*)::int AS n FROM articles WHERE restaurant_id=$1", [restaurantId]
  )).rows[0].n;
  const menuPages = pageCount(articles, 20);
  const editRows = (menu.html.match(/data-action="edit-/g) || []).length;
  check("TC-PAG-012", menu.status === 200 && menu.html.includes("data-pagination"),
    `GET /menu → ${menu.status}, pagination présente`);
  check("TC-PAG-013", meta(menu.html).pages === menuPages && editRows === Math.min(20, articles),
    `${editRows} lignes rendues, ${menuPages} page(s) pour ${articles} articles`);

  // --- 5. Exports : total du registre et pagination ---
  // React SSR insère `<!-- -->` entre les nœuds texte dynamiques :
  // on compare sur le HTML débarrassé de ces marqueurs.
  const exportCount = (await pool.query(
    "SELECT COUNT(*)::int AS n FROM exports WHERE restaurant_id=$1", [restaurantId]
  )).rows[0].n;
  const ex = await page("/exports", jar);
  const exPlain = ex.html.replace(/<!-- -->/g, "");
  check("TC-PAG-014", ex.status === 200 && exPlain.includes(`Registre des exports (${exportCount})`),
    `GET /exports → ${ex.status}, total ${exportCount}`);

  // --- 6. Rapports : liste par jour paginée, totaux non tronqués ---
  const payDays = (await pool.query(
    `SELECT COUNT(DISTINCT "timestamp"::date)::int AS n FROM journal_replica
     WHERE type='PAIEMENT' AND "timestamp" >= now() - interval '30 days'`
  )).rows[0].n;
  const rep = await page("/rapports", jar);
  const hasPagination = rep.html.includes("data-pagination");
  check("TC-PAG-015", rep.status === 200 && (payDays === 0 ? !hasPagination : hasPagination),
    `GET /rapports → ${rep.status}, ${payDays} jour(s) de paiement, pagination ${hasPagination ? "présente" : "absente"}`);

  console.log(`\nTC-PAG : ${pass} PASS, ${fail} FAIL`);
  await pool.end();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("TC-PAG ERREUR :", e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
