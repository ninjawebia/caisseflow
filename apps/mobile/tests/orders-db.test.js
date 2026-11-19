"use strict";
// TC-M5-DB — commandes sur une VRAIE base SQLite (node:sqlite via le shim) :
// migration 5, une seule commande active par table (index unique partiel),
// prix figés, fusion des lignes, envoi transactionnel avec VENTE au journal,
// compléments et atomicité (aucune vente sans commande à jour).
const test = require("node:test");
const assert = require("node:assert/strict");
const { openShim } = require("./db-shim");
const { MIGRATIONS, latestVersion } = require("../src/core/migrations");
const {
  createOrder, getOrder, listOpenOrders, openOrdersByTable,
  addArticle, setLineQty, removeLine, sendOrder,
} = require("../src/db/orders");
const { readJournalStatus } = require("../src/db/journal");

const POSTE = "POSTE-01";
const USER = { matricule: "MGR", nom: "Nadia Chef" };
const T1 = "77777777-7777-4777-8777-777777777777";
const T2 = "88888888-8888-4888-8888-888888888888";
const ART_A = "44444444-4444-4444-8444-444444444444";
const ART_B = "55555555-5555-4555-8555-555555555555";

const A = { id: ART_A, nom: "Burger", prixTtcCents: 1250, tauxTva: 10 };
const B = { id: ART_B, nom: "Café", prixTtcCents: 250, tauxTva: 20 };

async function freshDb() {
  const db = openShim();
  for (const m of MIGRATIONS) for (const s of m.statements) await db.execAsync(s);
  await db.execAsync(`PRAGMA user_version = ${latestVersion()}`);
  return db;
}

let seq = 0;
function uuidOp() {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

const at = (n) => `2026-11-19T12:00:${String(n).padStart(2, "0")}.000Z`;

async function newTableOrder(db, table = { id: T1, nom: "T1" }) {
  return createOrder(db, { poste: POSTE, type: "TABLE", table, user: USER, now: at(1), uuidOp });
}

test("migration 5 : tables commandes/lignes et index d'unicité par table", async () => {
  const db = await freshDb();
  const names = (await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r) => r.name);
  for (const t of ["commandes", "commande_lignes"]) assert.ok(names.includes(t), t);
  assert.equal((await db.getFirstAsync("PRAGMA user_version")).user_version, latestVersion());

  const indexes = (await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='index'")).map((r) => r.name);
  assert.ok(indexes.includes("idx_commandes_table_active"));

  const o = await newTableOrder(db);
  assert.equal(o.statut, "OUVERTE");
  assert.equal(o.totalTtcCents, 0);

  // La base refuse une 2e commande active sur la même table, même en SQL direct.
  await assert.rejects(() => db.runAsync(
    `INSERT INTO commandes (id, poste, type, table_id, table_nom, created_by, created_by_nom, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [uuidOp(), POSTE, "TABLE", T1, "T1", "MGR", "Nadia Chef", at(2)]
  ), /UNIQUE/);

  // Types et quantités sont contraints au niveau SQL.
  await assert.rejects(() => db.runAsync(
    `INSERT INTO commandes (id, poste, type, created_by, created_by_nom, created_at) VALUES (?,?,?,?,?,?)`,
    [uuidOp(), POSTE, "LIVRAISON", "MGR", "Nadia Chef", at(2)]
  ), /CHECK/);
});

test("création : table obligatoire, type valide, pas de doublon actif", async () => {
  const db = await freshDb();
  await assert.rejects(() => createOrder(db, { poste: null, type: "COMPTOIR", user: USER, uuidOp }), /Poste inconnu/);
  await assert.rejects(() => createOrder(db, { poste: POSTE, type: "TABLE", table: null, user: USER, uuidOp }), /Table obligatoire/);
  await assert.rejects(() => createOrder(db, { poste: POSTE, type: "LIVRAISON", user: USER, uuidOp }), /Type de commande/);
  await assert.rejects(() => createOrder(db, { poste: POSTE, type: "TABLE", table: { id: T1, nom: "T1" }, user: null, uuidOp }), /Opérateur/);

  const first = await newTableOrder(db);
  await assert.rejects(() => newTableOrder(db), /déjà une commande/);

  // Après l'envoi la table reste occupée : toujours un doublon.
  await addArticle(db, { orderId: first.id, article: A, uuidOp });
  await sendOrder(db, { orderId: first.id, user: USER, now: at(3), uuidOp });
  await assert.rejects(() => newTableOrder(db), /déjà une commande/);
});

test("panier : ajout, fusion, prix figé, quantités et totaux en centimes", async () => {
  const db = await freshDb();
  const order = await newTableOrder(db);

  let res = await addArticle(db, { orderId: order.id, article: A, qte: 2, now: at(1), uuidOp });
  assert.equal(res.lines.length, 1);
  assert.equal(res.merged, false);
  assert.equal(res.totals.totalTtcCents, 2500);

  res = await addArticle(db, { orderId: order.id, article: A, qte: 1, now: at(1), uuidOp });
  assert.equal(res.merged, true);
  assert.equal(res.lines.length, 1);
  assert.equal(res.lines[0].qte, 3);
  assert.equal(res.totals.totalTtcCents, 3750);

  res = await addArticle(db, { orderId: order.id, article: B, qte: 1, now: at(1), uuidOp });
  assert.equal(res.lines.length, 2);
  assert.equal(res.totals.totalTtcCents, 4000);
  assert.deepEqual(res.totals.tva.map((t) => t.taux), [10, 20]);

  // Le total est persisté, pas seulement retourné.
  const stored = await getOrder(db, order.id);
  assert.equal(stored.order.totalTtcCents, 4000);
  assert.equal(stored.lines.length, 2);

  // Prix figé : un article renommé/revalorisé ne réécrit pas la ligne.
  res = await addArticle(db, { orderId: order.id, article: { ...A, nom: "Burger XL", prixTtcCents: 1500 }, uuidOp });
  assert.equal(res.lines.length, 3);
  assert.equal(res.lines[0].nom, "Burger");
  assert.equal(res.lines[0].prixTtcCents, 1250);

  const lineA = res.lines[0].id;
  res = await setLineQty(db, { orderId: order.id, lineId: lineA, qte: 1 });
  assert.equal(res.totals.totalTtcCents, 1250 + 250 + 1500);

  res = await removeLine(db, { orderId: order.id, lineId: lineA });
  assert.equal(res.lines.length, 2);
  assert.equal(res.totals.totalTtcCents, 1750);

  await assert.rejects(() => setLineQty(db, { orderId: order.id, lineId: "nope", qte: 2 }), /Ligne introuvable/);
  await assert.rejects(() => addArticle(db, { orderId: "nope", article: A, uuidOp }), /Commande introuvable/);
});

test("envoi : VENTE journalisée, lignes gelées, table conservée", async () => {
  const db = await freshDb();
  const order = await newTableOrder(db);
  await addArticle(db, { orderId: order.id, article: A, qte: 2, uuidOp });
  await addArticle(db, { orderId: order.id, article: B, qte: 1, uuidOp });

  const sent = await sendOrder(db, { orderId: order.id, user: USER, now: at(5), uuidOp });
  assert.equal(sent.complement, false);
  assert.equal(sent.order.statut, "ENVOYEE");
  assert.equal(sent.order.journalRef, "POSTE-01-000001");
  assert.equal(sent.order.sentAt, at(5));
  assert.equal(sent.order.totalTtcCents, 2750);
  assert.ok(sent.lines.every((l) => l.envoyee === 1));

  const journal = await readJournalStatus(db);
  assert.equal(journal.count, 1);
  assert.ok(journal.chain.ok);
  const row = await db.getFirstAsync("SELECT type, ref, user_matricule, payload FROM journal WHERE seq = 1");
  assert.equal(row.type, "VENTE");
  assert.equal(row.ref, "POSTE-01-000001");
  assert.equal(row.user_matricule, "MGR");
  const journalPayload = JSON.parse(row.payload);
  assert.equal(journalPayload.type, "VENTE");
  assert.equal(journalPayload.motif, "Envoi en cuisine");
  const payload = journalPayload.data;
  assert.equal(payload.commande_id, order.id);
  assert.equal(payload.total_envoi_ttc_cents, 2750);
  assert.equal(payload.lignes.length, 2);
  assert.equal(payload.complement, false);

  // Lignes envoyées : ni quantité ni suppression.
  const lineId = sent.lines[0].id;
  await assert.rejects(() => setLineQty(db, { orderId: order.id, lineId, qte: 1 }), /envoyée/);
  await assert.rejects(() => removeLine(db, { orderId: order.id, lineId }), /envoyée/);

  // Re-envoi sans nouvelle ligne : refusé, aucune écriture de plus.
  await assert.rejects(() => sendOrder(db, { orderId: order.id, user: USER, now: at(6), uuidOp }), /Aucune ligne/);
  assert.equal((await readJournalStatus(db)).count, 1);
});

test("complément : un ajout après envoi écrit une 2e VENTE", async () => {
  const db = await freshDb();
  const order = await newTableOrder(db);
  await addArticle(db, { orderId: order.id, article: A, qte: 1, uuidOp });
  await sendOrder(db, { orderId: order.id, user: USER, now: at(1), uuidOp });

  const added = await addArticle(db, { orderId: order.id, article: B, qte: 2, uuidOp });
  assert.equal(added.lines.length, 2);
  assert.equal(added.totals.totalTtcCents, 1250 + 500);

  const sent = await sendOrder(db, { orderId: order.id, user: USER, now: at(7), uuidOp });
  assert.equal(sent.complement, true);
  assert.equal(sent.order.journalRef, "POSTE-01-000002");
  assert.equal(sent.payload.total_envoi_ttc_cents, 500);
  assert.equal(sent.payload.total_commande_ttc_cents, 1750);
  assert.equal(sent.payload.lignes.length, 1);

  const journal = await readJournalStatus(db);
  assert.equal(journal.count, 2);
  assert.ok(journal.chain.ok);
});

test("atomicité : un envoi refusé n'écrit rien et laisse la commande intacte", async () => {
  const db = await freshDb();
  const order = await newTableOrder(db);
  await addArticle(db, { orderId: order.id, article: A, qte: 1, uuidOp });

  // Utilisateur invalide (matricule trop long) : appendEntry échoue APRÈS la
  // lecture et AVANT les marquages.
  await assert.rejects(
    () => sendOrder(db, { orderId: order.id, user: { matricule: "X".repeat(20), nom: "Test" }, now: at(2), uuidOp }),
    /Matricule trop long/
  );

  const after = await getOrder(db, order.id);
  assert.equal(after.order.statut, "OUVERTE");
  assert.equal(after.order.journalRef, null);
  assert.equal(after.lines[0].envoyee, 0);
  assert.equal((await readJournalStatus(db)).count, 0);

  // L'envoi reste possible ensuite.
  const sent = await sendOrder(db, { orderId: order.id, user: USER, now: at(3), uuidOp });
  assert.equal(sent.order.statut, "ENVOYEE");
  assert.equal((await readJournalStatus(db)).count, 1);
});

test("comptoir : plusieurs commandes sans table, plan de salle à jour", async () => {
  const db = await freshDb();
  const t1 = await newTableOrder(db);
  const c1 = await createOrder(db, { poste: POSTE, type: "COMPTOIR", user: USER, now: at(1), uuidOp });
  const c2 = await createOrder(db, { poste: POSTE, type: "COMPTOIR", user: USER, now: at(2), uuidOp });
  assert.equal(c1.tableId, null);
  assert.notEqual(c1.id, c2.id);

  await addArticle(db, { orderId: t1.id, article: A, uuidOp });
  const open = await listOpenOrders(db, POSTE);
  assert.equal(open.length, 3);

  const byTable = await openOrdersByTable(db, POSTE);
  assert.deepEqual(Object.keys(byTable), [T1]);
  assert.equal(byTable[T1].id, t1.id);
  assert.equal(byTable[T1].totalTtcCents, 1250);

  // Une autre table reste libre.
  assert.equal(byTable[T2], undefined);
});
