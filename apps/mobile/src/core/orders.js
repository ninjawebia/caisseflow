"use strict";
// Commandes (M5) — logique PURE de la prise de commande : ajout d'articles avec
// PRIX FIGÉ (snapshot, POS-2), quantités, suppression, totaux TTC et ventilation
// de TVA en centimes entiers, et charge utile de l'écriture VENTE de l'envoi en
// cuisine (POS-3). Aucune dépendance native : testable sous Node.
const { CaisseError, CODES } = require("./errors");
const { MAX_CENTS } = require("./money");

const MAX_QTE = 99;
const ORDER_TYPES = ["TABLE", "COMPTOIR"];
const ORDER_STATUTS = ["OUVERTE", "ENVOYEE", "ENCAISSEE"];

function invalid(message) {
  return new CaisseError(CODES.COMMANDE, message);
}

function assertQte(qte) {
  if (!Number.isInteger(qte) || qte < 1 || qte > MAX_QTE) {
    throw invalid(`Quantité invalide : entier de 1 à ${MAX_QTE} attendu`);
  }
  return qte;
}

// Valide l'article AU MOMENT de l'ajout : ce qui est stocké ensuite est un
// instantané, jamais relu dans le catalogue.
function assertArticle(article) {
  if (!article || typeof article !== "object") throw invalid("Article manquant");
  const id = String(article.id || "");
  if (!id) throw invalid("Article sans identifiant");
  const nom = String(article.nom || "").trim();
  if (!nom) throw invalid("Article sans nom");
  const prix = article.prixTtcCents;
  if (!Number.isInteger(prix) || prix < 0 || prix > MAX_CENTS) {
    throw invalid(`Prix invalide pour « ${nom} »`);
  }
  const taux = Number(article.tauxTva);
  if (!Number.isFinite(taux) || taux < 0 || taux > 100) {
    throw invalid(`TVA invalide pour « ${nom} »`);
  }
  return { id, nom, prixTtcCents: prix, tauxTva: taux };
}

// Ajoute `qte` exemplaires d'un article. Une ligne NON ENVOYÉE du même article
// au même prix est incrémentée (panier lisible) ; une ligne déjà envoyée n'est
// jamais modifiée : un ajout après envoi crée une ligne de complément (POS-3).
function upsertLine(lines, article, qte = 1, newId = null) {
  const clean = assertArticle(article);
  assertQte(qte);
  const current = Array.isArray(lines) ? lines : [];
  const idx = current.findIndex(
    (l) =>
      Number(l.envoyee) === 0 &&
      l.articleId === clean.id &&
      Number(l.prixTtcCents) === clean.prixTtcCents &&
      Number(l.tauxTva) === clean.tauxTva
  );

  if (idx >= 0) {
    const line = current[idx];
    const nextQte = Number(line.qte) + qte;
    if (nextQte > MAX_QTE) throw invalid(`Quantité maximale de ${MAX_QTE} par ligne`);
    const next = current.map((l, i) => (i === idx ? { ...l, qte: nextQte } : l));
    return { lines: next, lineId: line.id, merged: true };
  }

  if (!newId) throw invalid("Identifiant de ligne manquant");
  const line = {
    id: newId,
    articleId: clean.id,
    nom: clean.nom,
    prixTtcCents: clean.prixTtcCents,
    tauxTva: clean.tauxTva,
    qte,
    envoyee: 0,
  };
  return { lines: [...current, line], lineId: line.id, merged: false };
}

function changeQty(lines, lineId, qte) {
  assertQte(qte);
  const current = Array.isArray(lines) ? lines : [];
  if (!current.some((l) => l.id === lineId)) throw invalid("Ligne introuvable");
  return current.map((l) => (l.id === lineId ? { ...l, qte } : l));
}

function removeLine(lines, lineId) {
  const current = Array.isArray(lines) ? lines : [];
  if (!current.some((l) => l.id === lineId)) throw invalid("Ligne introuvable");
  return current.filter((l) => l.id !== lineId);
}

function unsentLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter((l) => Number(l.envoyee) === 0);
}

// Totaux en CENTIMES : montant TTC, nombre d'articles, et ventilation par taux
// de TVA. La TVA est extraite du TTC : HT = arrondi(TTC / (1 + taux/100)) au
// centime, TVA = TTC − HT. L'arrondi par LIGNE garantit que la somme des
// colonnes égale exactement le total (aucun centime perdu).
function orderTotals(lines) {
  const byRate = new Map();
  let totalTtcCents = 0;
  let nbArticles = 0;

  for (const line of Array.isArray(lines) ? lines : []) {
    const qte = Number(line.qte);
    const prix = Number(line.prixTtcCents);
    const taux = Number(line.tauxTva);
    if (!Number.isInteger(qte) || qte < 1) throw invalid("Quantité de ligne invalide");
    if (!Number.isInteger(prix) || prix < 0) throw invalid("Prix de ligne invalide");
    if (!Number.isFinite(taux) || taux < 0 || taux > 100) throw invalid("TVA de ligne invalide");

    const ttc = qte * prix;
    const ht = Math.round(ttc / (1 + taux / 100));
    totalTtcCents += ttc;
    nbArticles += qte;

    const acc = byRate.get(taux) || { taux, htCents: 0, tvaCents: 0, ttcCents: 0 };
    acc.htCents += ht;
    acc.tvaCents += ttc - ht;
    acc.ttcCents += ttc;
    byRate.set(taux, acc);
  }

  return {
    totalTtcCents,
    nbArticles,
    nbLignes: (Array.isArray(lines) ? lines : []).length,
    tva: [...byRate.values()].sort((a, b) => a.taux - b.taux),
  };
}

function assertSendable(lines) {
  const pending = unsentLines(lines);
  if (pending.length === 0) throw invalid("Aucune ligne à envoyer en cuisine");
  return pending;
}

// Charge utile AUTO-PORTEUSE de l'écriture VENTE (POS-3) : elle contient les
// prix figés, les quantités envoyées MAINTENANT et la ventilation de TVA, donc
// elle reste vérifiable sans relire le catalogue ni la commande.
function buildSalePayload({ order, lines, complement = false }) {
  if (!order || !order.id) throw invalid("Commande manquante");
  const pending = assertSendable(lines);
  const envoyees = orderTotals(pending);
  const complete = orderTotals(lines);
  return {
    commande_id: order.id,
    type: order.type,
    table_id: order.tableId || null,
    table_nom: order.tableNom || null,
    complement: Boolean(complement),
    lignes: pending.map((l) => ({
      ligne_id: l.id,
      article_id: l.articleId,
      nom: l.nom,
      prix_ttc_cents: Number(l.prixTtcCents),
      taux_tva: Number(l.tauxTva),
      qte: Number(l.qte),
    })),
    total_envoi_ttc_cents: envoyees.totalTtcCents,
    total_commande_ttc_cents: complete.totalTtcCents,
    tva_envoi: envoyees.tva,
  };
}

module.exports = {
  MAX_QTE,
  ORDER_TYPES,
  ORDER_STATUTS,
  assertQte,
  assertArticle,
  upsertLine,
  changeQty,
  removeLine,
  unsentLines,
  orderTotals,
  assertSendable,
  buildSalePayload,
};
