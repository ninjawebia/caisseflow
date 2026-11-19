"use strict";
// SQL des commandes (M5) — texte et mappings PURS, partagés par l'adaptateur
// expo-sqlite et les tests `node:sqlite`.

const INSERT_ORDER_SQL = `INSERT INTO commandes
    (id, poste, type, table_id, table_nom, statut, total_ttc_cents,
     created_by, created_by_nom, created_at)
  VALUES (?,?,?,?,?,'OUVERTE',0,?,?,?)`;

function insertOrderArgs(o) {
  return [
    o.id, o.poste, o.type, o.tableId || null, o.tableNom || null,
    o.createdBy, o.createdByNom, o.createdAt,
  ];
}

const INSERT_LINE_SQL = `INSERT INTO commande_lignes
    (id, commande_id, article_id, nom, prix_ttc_cents, taux_tva, qte, envoyee, created_at)
  VALUES (?,?,?,?,?,?,?,0,?)`;

function insertLineArgs(commandeId, line, createdAt) {
  return [
    line.id, commandeId, line.articleId, line.nom,
    line.prixTtcCents, line.tauxTva, line.qte, createdAt,
  ];
}

const UPDATE_LINE_QTE_SQL = `UPDATE commande_lignes SET qte = ? WHERE id = ? AND commande_id = ? AND envoyee = 0`;
const DELETE_LINE_SQL = `DELETE FROM commande_lignes WHERE id = ? AND commande_id = ? AND envoyee = 0`;
const UPDATE_TOTAL_SQL = `UPDATE commandes SET total_ttc_cents = ? WHERE id = ?`;

const SELECT_ORDER_SQL = `SELECT id, poste, type, table_id, table_nom, statut, total_ttc_cents,
    created_by, created_by_nom, created_at, sent_at, journal_ref
  FROM commandes WHERE id = ?`;

const SELECT_LINES_SQL = `SELECT id, commande_id, article_id, nom, prix_ttc_cents, taux_tva, qte, envoyee
  FROM commande_lignes WHERE commande_id = ? ORDER BY created_at, rowid`;

const SELECT_OPEN_ORDERS_SQL = `SELECT id, poste, type, table_id, table_nom, statut, total_ttc_cents,
    created_by, created_by_nom, created_at, sent_at, journal_ref
  FROM commandes
  WHERE poste = ? AND statut IN ('OUVERTE','ENVOYEE')
  ORDER BY created_at`;

const SELECT_ORDER_FOR_TABLE_SQL = `SELECT id FROM commandes
  WHERE poste = ? AND table_id = ? AND statut IN ('OUVERTE','ENVOYEE')
  LIMIT 1`;

// Envoi : les lignes envoyées ne sont plus modifiables, et la commande passe
// ENVOYEE (elle occupe toujours la table jusqu'à l'encaissement).
const MARK_LINES_SENT_SQL = `UPDATE commande_lignes SET envoyee = 1 WHERE commande_id = ? AND envoyee = 0`;
const MARK_ORDER_SENT_SQL = `UPDATE commandes SET statut = 'ENVOYEE', sent_at = ?, journal_ref = ?
  WHERE id = ? AND statut IN ('OUVERTE','ENVOYEE')`;

const COUNT_OPEN_ORDERS_SQL = `SELECT COUNT(*) AS n FROM commandes
  WHERE poste = ? AND statut IN ('OUVERTE','ENVOYEE')`;

function lineToModel(r) {
  return {
    id: r.id,
    commandeId: r.commande_id,
    articleId: r.article_id,
    nom: r.nom,
    prixTtcCents: Number(r.prix_ttc_cents),
    tauxTva: Number(r.taux_tva),
    qte: Number(r.qte),
    envoyee: Number(r.envoyee),
  };
}

function orderToModel(r) {
  return {
    id: r.id,
    poste: r.poste,
    type: r.type,
    tableId: r.table_id,
    tableNom: r.table_nom,
    statut: r.statut,
    totalTtcCents: Number(r.total_ttc_cents),
    createdBy: r.created_by,
    createdByNom: r.created_by_nom,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    journalRef: r.journal_ref,
  };
}

module.exports = {
  INSERT_ORDER_SQL,
  insertOrderArgs,
  INSERT_LINE_SQL,
  insertLineArgs,
  UPDATE_LINE_QTE_SQL,
  DELETE_LINE_SQL,
  UPDATE_TOTAL_SQL,
  SELECT_ORDER_SQL,
  SELECT_LINES_SQL,
  SELECT_OPEN_ORDERS_SQL,
  SELECT_ORDER_FOR_TABLE_SQL,
  MARK_LINES_SENT_SQL,
  MARK_ORDER_SENT_SQL,
  COUNT_OPEN_ORDERS_SQL,
  lineToModel,
  orderToModel,
};
