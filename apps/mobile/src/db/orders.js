"use strict";
// Commandes (M5) — adaptateur expo-sqlite : brouillons locaux, ajout d'articles
// au prix figé, quantités, suppression et envoi en cuisine.
//
// Rien n'entre au journal fiscal avant l'envoi : une commande en cours est un
// brouillon modifiable. L'envoi écrit UNE fois une VENTE (pré-encaissement,
// POS-3) puis gèle les lignes envoyées ; un ajout ultérieur crée un complément
// (nouvelle VENTE). Toutes les fonctions sont testables sous Node (mêmes
// requêtes, aucun natif importé).
const { CaisseError, CODES } = require("../core/errors");
const {
  ORDER_TYPES,
  assertQte,
  assertArticle,
  upsertLine,
  changeQty,
  removeLine,
  orderTotals,
  buildSalePayload,
} = require("../core/orders");
const { appendEntry } = require("./journal");
const S = require("./orders-sql");

function invalid(message) {
  return new CaisseError(CODES.COMMANDE, message);
}

function requireUuid(options) {
  if (!options || typeof options.uuidOp !== "function") {
    throw new CaisseError(CODES.STORAGE, "Générateur d'identifiant manquant (uuidOp)");
  }
  return options.uuidOp;
}

function nowIso(value) {
  return value || new Date().toISOString();
}

async function loadOrder(db, orderId) {
  const row = await db.getFirstAsync(S.SELECT_ORDER_SQL, [orderId]);
  if (!row) throw invalid("Commande introuvable");
  return S.orderToModel(row);
}

async function loadLines(db, orderId) {
  const rows = await db.getAllAsync(S.SELECT_LINES_SQL, [orderId]);
  return rows.map(S.lineToModel);
}

async function loadOrderWithLines(db, orderId) {
  const order = await loadOrder(db, orderId);
  return { order, lines: await loadLines(db, orderId) };
}

async function saveTotal(db, orderId, lines) {
  const totals = orderTotals(lines);
  await db.runAsync(S.UPDATE_TOTAL_SQL, [totals.totalTtcCents, orderId]);
  return totals;
}

// Nouvelle commande. Une table ne peut porter qu'UNE commande active (POS-1) :
// la base le garantit par index unique partiel, l'adaptateur renvoie un message
// clair plutôt qu'une erreur SQLite.
async function createOrder(db, options) {
  const uuidOp = requireUuid(options);
  const { poste, type, table, user } = options;
  if (!/^POSTE-\d{2}$/.test(String(poste || ""))) {
    throw invalid("Poste inconnu sur cette tablette — synchronisez avant de prendre une commande");
  }
  if (!ORDER_TYPES.includes(type)) throw invalid("Type de commande invalide");
  if (!user || !user.matricule || !user.nom) throw invalid("Opérateur manquant");
  if (type === "TABLE" && (!table || !table.id || !table.nom)) {
    throw invalid("Table obligatoire pour une commande sur place");
  }

  if (type === "TABLE") {
    const existing = await db.getFirstAsync(S.SELECT_ORDER_FOR_TABLE_SQL, [poste, table.id]);
    if (existing) throw invalid(`La table ${table.nom} a déjà une commande en cours`);
  }

  const order = {
    id: uuidOp(),
    poste,
    type,
    tableId: type === "TABLE" ? table.id : null,
    tableNom: type === "TABLE" ? table.nom : null,
    createdBy: user.matricule,
    createdByNom: user.nom,
    createdAt: nowIso(options.now),
  };
  await db.runAsync(S.INSERT_ORDER_SQL, S.insertOrderArgs(order));
  return { ...order, statut: "OUVERTE", totalTtcCents: 0, sentAt: null, journalRef: null };
}

async function getOrder(db, orderId) {
  const { order, lines } = await loadOrderWithLines(db, orderId);
  return { order, lines, totals: orderTotals(lines) };
}

async function listOpenOrders(db, poste) {
  const rows = await db.getAllAsync(S.SELECT_OPEN_ORDERS_SQL, [poste]);
  return rows.map(S.orderToModel);
}

// Occupation des tables pour le plan de salle : table_id → commande active.
async function openOrdersByTable(db, poste) {
  const orders = await listOpenOrders(db, poste);
  const map = {};
  for (const order of orders) {
    if (order.tableId) map[order.tableId] = order;
  }
  return map;
}

// Ajoute un article au panier. Une ligne non envoyée du même article/prix/TVA
// est fusionnée ; sinon une ligne est créée avec les valeurs DU MOMENT.
async function addArticle(db, options) {
  const uuidOp = requireUuid(options);
  const { orderId, article, qte = 1 } = options;
  const { order, lines } = await loadOrderWithLines(db, orderId);
  if (order.statut === "ENCAISSEE") throw invalid("Commande déjà encaissée");

  const clean = assertArticle(article);
  assertQte(qte);
  const result = upsertLine(lines, clean, qte, uuidOp());
  const createdAt = nowIso(options.now);
  const line = result.lines.find((l) => l.id === result.lineId);

  if (result.merged) {
    await db.runAsync(S.UPDATE_LINE_QTE_SQL, [line.qte, line.id, orderId]);
  } else {
    await db.runAsync(S.INSERT_LINE_SQL, S.insertLineArgs(orderId, line, createdAt));
  }

  const totals = await saveTotal(db, orderId, result.lines);
  return {
    order: { ...order, totalTtcCents: totals.totalTtcCents },
    lines: result.lines,
    totals,
    lineId: result.lineId,
    merged: result.merged,
  };
}

async function setLineQty(db, options) {
  const { orderId, lineId, qte } = options;
  const lines = await loadLines(db, orderId);
  const target = lines.find((l) => l.id === lineId);
  if (!target) throw invalid("Ligne introuvable");
  if (target.envoyee) throw invalid("Une ligne envoyée en cuisine ne peut plus être modifiée");

  const next = changeQty(lines, lineId, qte);
  await db.runAsync(S.UPDATE_LINE_QTE_SQL, [qte, lineId, orderId]);
  const totals = await saveTotal(db, orderId, next);
  return { lines: next, totals };
}

async function removeLineFromOrder(db, options) {
  const { orderId, lineId } = options;
  const lines = await loadLines(db, orderId);
  const target = lines.find((l) => l.id === lineId);
  if (!target) throw invalid("Ligne introuvable");
  if (target.envoyee) throw invalid("Une ligne envoyée en cuisine ne peut plus être supprimée");

  const next = removeLine(lines, lineId);
  await db.runAsync(S.DELETE_LINE_SQL, [lineId, orderId]);
  const totals = await saveTotal(db, orderId, next);
  return { lines: next, totals };
}

// Envoi en cuisine : transaction unique —
//   1. VENTE au journal (payload auto-porteur, prix figés, TVA par taux) ;
//   2. lignes marquées envoyées (plus modifiables) ;
//   3. commande ENVOYEE + référence du journal (la table reste occupée).
// Un échec à n'importe quelle étape annule TOUT : jamais de vente journalisée
// sans commande à jour, ni de commande « envoyée » sans écriture fiscale.
async function sendOrder(db, options) {
  const uuidOp = requireUuid(options);
  const { orderId, user } = options;
  if (!user || !user.matricule || !user.nom) throw invalid("Opérateur manquant");

  let result = null;
  await db.withTransactionAsync(async () => {
    const { order, lines } = await loadOrderWithLines(db, orderId);
    if (order.statut === "ENCAISSEE") throw invalid("Commande déjà encaissée");
    const complement = lines.some((l) => Number(l.envoyee) === 1);
    const payload = buildSalePayload({ order, lines, complement });
    const at = nowIso(options.now);

    const journal = await appendEntry(db, {
      poste: order.poste,
      type: "VENTE",
      user,
      motif: complement ? "Complément envoyé en cuisine" : "Envoi en cuisine",
      data: payload,
      now: at,
      uuidOp,
    });

    await db.runAsync(S.MARK_LINES_SENT_SQL, [orderId]);
    await db.runAsync(S.MARK_ORDER_SENT_SQL, [at, journal.entry.ref, orderId]);
    const sentLines = await loadLines(db, orderId);
    const totals = await saveTotal(db, orderId, sentLines);

    result = {
      order: {
        ...order,
        statut: "ENVOYEE",
        totalTtcCents: totals.totalTtcCents,
        sentAt: journal.entry.tsLocal,
        journalRef: journal.entry.ref,
      },
      lines: sentLines,
      totals,
      payload,
      entry: journal.entry,
      clock: journal.clock,
      complement,
    };
  });
  return result;
}

module.exports = {
  createOrder,
  getOrder,
  listOpenOrders,
  openOrdersByTable,
  addArticle,
  setLineQty,
  removeLine: removeLineFromOrder,
  sendOrder,
};
