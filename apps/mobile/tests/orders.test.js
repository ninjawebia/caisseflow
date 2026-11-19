"use strict";
// TC-M5 — logique PURE de la commande : quantités, fusion de lignes, prix figés,
// totaux en centimes, ventilation de TVA et charge utile de l'envoi (VENTE).
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_QTE,
  assertQte,
  assertArticle,
  upsertLine,
  changeQty,
  removeLine,
  unsentLines,
  orderTotals,
  assertSendable,
  buildSalePayload,
} = require("../src/core/orders");

const ART = {
  id: "44444444-4444-4444-8444-444444444444",
  nom: "Burger",
  prixTtcCents: 1250,
  tauxTva: 10,
};
const ART2 = {
  id: "55555555-5555-4555-8555-555555555555",
  nom: "Café",
  prixTtcCents: 250,
  tauxTva: 20,
};

function line(over = {}) {
  return {
    id: "l1",
    articleId: ART.id,
    nom: ART.nom,
    prixTtcCents: ART.prixTtcCents,
    tauxTva: ART.tauxTva,
    qte: 1,
    envoyee: 0,
    ...over,
  };
}

test("quantités : entier de 1 à 99 uniquement", () => {
  assert.equal(assertQte(1), 1);
  assert.equal(assertQte(MAX_QTE), MAX_QTE);
  for (const bad of [0, -1, 1.5, 100, "2", null, undefined, NaN]) {
    assert.throws(() => assertQte(bad), (e) => e.code === "COMMANDE", String(bad));
  }
});

test("article : identifiant, nom, prix entier et TVA bornée exigés", () => {
  assert.deepEqual(assertArticle(ART), ART);
  assert.throws(() => assertArticle(null), /Article manquant/);
  assert.throws(() => assertArticle({ ...ART, id: "" }), /identifiant/);
  assert.throws(() => assertArticle({ ...ART, nom: "  " }), /nom/);
  assert.throws(() => assertArticle({ ...ART, prixTtcCents: 12.5 }), /Prix invalide/);
  assert.throws(() => assertArticle({ ...ART, prixTtcCents: null }), /Prix invalide/);
  assert.throws(() => assertArticle({ ...ART, prixTtcCents: -1 }), /Prix invalide/);
  assert.throws(() => assertArticle({ ...ART, prixTtcCents: 1000001 }), /Prix invalide/);
  assert.throws(() => assertArticle({ ...ART, tauxTva: 101 }), /TVA invalide/);
});

test("ajout : une ligne non envoyée du même article/prix est fusionnée", () => {
  const first = upsertLine([], ART, 1, "l1");
  assert.equal(first.lines.length, 1);
  assert.equal(first.lineId, "l1");
  assert.equal(first.merged, false);
  assert.equal(first.lines[0].prixTtcCents, 1250);

  const second = upsertLine(first.lines, ART, 2, "l2");
  assert.equal(second.merged, true);
  assert.equal(second.lines.length, 1);
  assert.equal(second.lines[0].qte, 3);
  assert.equal(second.lineId, "l1");
});

test("un prix différent crée une NOUVELLE ligne (prix figé, POS-2)", () => {
  const existing = [line({ prixTtcCents: 1000 })];
  const res = upsertLine(existing, ART, 1, "l9");
  assert.equal(res.merged, false);
  assert.equal(res.lines.length, 2);
  assert.equal(res.lines[0].prixTtcCents, 1000);
  assert.equal(res.lines[1].prixTtcCents, 1250);
});

test("une ligne déjà envoyée n'est jamais fusionnée : complément", () => {
  const sent = [line({ envoyee: 1, qte: 2 })];
  const res = upsertLine(sent, ART, 1, "l2");
  assert.equal(res.merged, false);
  assert.equal(res.lines.length, 2);
  assert.equal(res.lines[0].qte, 2);
  assert.equal(res.lines[1].envoyee, 0);
});

test("fusion au-delà de 99 refusée", () => {
  const existing = [line({ qte: 98 })];
  assert.throws(() => upsertLine(existing, ART, 2, "l2"), /maximale de 99/);
});

test("quantité et suppression : ligne introuvable ou hors bornes refusées", () => {
  const lines = [line()];
  assert.deepEqual(changeQty(lines, "l1", 3), [line({ qte: 3 })]);
  assert.throws(() => changeQty(lines, "l1", 0), /Quantité invalide/);
  assert.throws(() => changeQty(lines, "nope", 2), /Ligne introuvable/);
  assert.deepEqual(removeLine(lines, "l1"), []);
  assert.throws(() => removeLine(lines, "nope"), /Ligne introuvable/);
});

test("lignes à envoyer : seules les non envoyées", () => {
  const lines = [line({ id: "a", envoyee: 0 }), line({ id: "b", envoyee: 1 })];
  assert.deepEqual(unsentLines(lines).map((l) => l.id), ["a"]);
  assert.throws(() => assertSendable([line({ envoyee: 1 })]), /Aucune ligne à envoyer/);
});

test("totaux : centimes entiers, TVA extraite du TTC par ligne", () => {
  const lines = [
    line({ id: "a", qte: 2, prixTtcCents: 1000, tauxTva: 10 }),
    line({ id: "b", qte: 1, prixTtcCents: 500, tauxTva: 20 }),
  ];
  const totals = orderTotals(lines);
  assert.equal(totals.totalTtcCents, 2500);
  assert.equal(totals.nbArticles, 3);
  assert.equal(totals.nbLignes, 2);
  assert.deepEqual(totals.tva, [
    { taux: 10, htCents: 1818, tvaCents: 182, ttcCents: 2000 },
    { taux: 20, htCents: 417, tvaCents: 83, ttcCents: 500 },
  ]);
  // HT + TVA = TTC au centime près, sur chaque taux.
  for (const t of totals.tva) assert.equal(t.htCents + t.tvaCents, t.ttcCents);
  assert.equal(totals.tva.reduce((a, t) => a + t.ttcCents, 0), totals.totalTtcCents);
});

test("totaux : lignes invalides refusées", () => {
  assert.throws(() => orderTotals([line({ qte: 0 })]), /Quantité/);
  assert.throws(() => orderTotals([line({ prixTtcCents: 1.2 })]), /Prix/);
  assert.throws(() => orderTotals([line({ tauxTva: -1 })]), /TVA/);
  assert.deepEqual(orderTotals([]), { totalTtcCents: 0, nbArticles: 0, nbLignes: 0, tva: [] });
});

test("charge utile VENTE : auto-porteuse, seulement les lignes à envoyer", () => {
  const order = {
    id: "11111111-1111-4111-8111-111111111111",
    type: "TABLE",
    tableId: "77777777-7777-4777-8777-777777777777",
    tableNom: "T1",
  };
  const lines = [
    line({ id: "a", qte: 2, envoyee: 0 }),
    line({ id: "b", articleId: ART2.id, nom: ART2.nom, prixTtcCents: 250, tauxTva: 20, envoyee: 1, qte: 1 }),
    line({ id: "c", articleId: ART2.id, nom: ART2.nom, prixTtcCents: 250, tauxTva: 20, envoyee: 0, qte: 3 }),
  ];
  const payload = buildSalePayload({ order, lines });

  assert.equal(payload.commande_id, order.id);
  assert.equal(payload.type, "TABLE");
  assert.equal(payload.table_nom, "T1");
  assert.equal(payload.complement, false);
  assert.deepEqual(payload.lignes.map((l) => l.ligne_id), ["a", "c"]);
  assert.equal(payload.total_envoi_ttc_cents, 2 * 1250 + 3 * 250);
  assert.equal(payload.total_commande_ttc_cents, 2 * 1250 + 250 + 3 * 250);
  // TVA de l'envoi uniquement : 10 % sur 2500 et 20 % sur 750.
  assert.deepEqual(payload.tva_envoi, [
    { taux: 10, htCents: 2273, tvaCents: 227, ttcCents: 2500 },
    { taux: 20, htCents: 625, tvaCents: 125, ttcCents: 750 },
  ]);
});

test("charge utile : un envoi sans ligne est refusé", () => {
  const order = { id: "11111111-1111-4111-8111-111111111111", type: "COMPTOIR" };
  assert.throws(() => buildSalePayload({ order, lines: [] }), /Aucune ligne/);
  assert.throws(() => buildSalePayload({ order: null, lines: [] }), /Commande manquante/);
});
