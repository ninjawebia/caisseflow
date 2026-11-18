"use strict";
// Montants (M4) — la caisse manipule des CENTIMES ENTIERS, jamais des
// flottants : les totaux et la ventilation de TVA d'un ticket doivent être
// exacts au centime (PRD 9.1, POS-2/5). Conversion uniquement aux frontières
// (pull : euros → centimes ; affichage/ticket : centimes → euros formatés).

const MAX_CENTS = 1000000; // 10 000,00 € — plafond du PRD (§ validations)

// 12.5 → 1250 ; 0.07 → 7 ; refuse NaN/Infini/hors plafond.
function toCents(value) {
  // Une valeur absente n'est JAMAIS un zéro : un prix manquant ne doit pas
  // devenir un article gratuit.
  if (value === null || value === undefined || value === "" || typeof value === "boolean") {
    throw new Error(`Montant invalide : ${value}`);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Montant invalide : ${value}`);
  const cents = Math.round(n * 100);
  if (cents < 0 || cents > MAX_CENTS) throw new Error(`Montant hors bornes (0 à 10 000 €) : ${value}`);
  return cents;
}

function fromCents(cents) {
  if (!Number.isInteger(cents)) throw new Error(`Centimes attendus (entier) : ${cents}`);
  return cents / 100;
}

// Affichage français SANS dépendre d'Intl : "1 234,50 €".
function formatEuros(cents) {
  const n = Math.abs(Number(cents));
  if (!Number.isFinite(n)) return "—";
  const euros = Math.floor(n / 100);
  const unit = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  const dec = String(Math.abs(n) % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${unit},${dec}\u00A0€`;
}

// Somme de lignes {prix_ttc_cents, qte} — en centimes, sans arrondi flottant.
function sumLines(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((acc, l) => {
    const qte = Number(l && l.qte);
    const prix = Number(l && l.prix_ttc_cents);
    if (!Number.isInteger(qte) || qte <= 0) throw new Error(`Quantité invalide : ${l && l.qte}`);
    if (!Number.isInteger(prix) || prix < 0) throw new Error(`Prix invalide : ${l && l.prix_ttc_cents}`);
    return acc + qte * prix;
  }, 0);
}

module.exports = { MAX_CENTS, toCents, fromCents, formatEuros, sumLines };
