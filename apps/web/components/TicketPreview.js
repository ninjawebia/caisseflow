"use client";

// Aperçu du ticket (S-11, IMP-4) — rendu approchant d'un ticket papier 58 mm
// (imprimante thermique ESC/POS : police monospace, séparateurs pointillés).
// Mise à jour EN DIRECT pendant la saisie du logo et des mentions. Les mentions
// légales NF525 sont des données d'EXEMPLE figées (elles sont imprimées par la
// caisse, jamais configurables) — l'aperçu ne remplace pas le rendu imprimé.
const SAMPLE = [
  { q: 1, nom: "Menu du jour", pu: 14.5, tva: 10 },
  { q: 2, nom: "Café expresso", pu: 1.8, tva: 5.5 },
  { q: 1, nom: "Eau minérale", pu: 2.5, tva: 0 },
];
const eur = (n) => n.toFixed(2).replace(".", ",") + " €";

export default function TicketPreview({ restaurant, template }) {
  const tvaByRate = SAMPLE.reduce((acc, l) => {
    const ttc = l.pu * l.q;
    const ht = ttc / (1 + l.tva / 100);
    const t = acc[l.tva] || { ht: 0, tva: 0 };
    acc[l.tva] = { ht: t.ht + ht, tva: t.tva + (ttc - ht) };
    return acc;
  }, {});
  const total = SAMPLE.reduce((s, l) => s + l.pu * l.q, 0);

  return (
    <div className="flex justify-center">
      {/* Papier thermique 58 mm ≈ 224 px */}
      <div data-testid="ticket-preview" className="w-56 bg-white border border-slate-300 rounded-sm shadow-md px-3 py-4 font-mono text-[11px] leading-relaxed text-slate-900 select-none">
        {/* En-tête : logo libre + identité du restaurant */}
        <div className="text-center">
          <p className="font-bold text-xs">{(template?.logo_text || restaurant?.nom || "Restaurant").toUpperCase()}</p>
          <p>{restaurant?.nom || "— Raison sociale —"}</p>
          <p className="whitespace-pre-line">{restaurant?.adresse || "— Adresse —"}</p>
          <p>SIRET {restaurant?.siret || "— SIRET —"}</p>
        </div>

        <div className="my-2 border-t border-dashed border-slate-400" />
        <div className="flex justify-between"><span>Ticket POSTE-01-000123</span><span>12:34:56</span></div>
        <div className="flex justify-between"><span>17/11/2026</span><span>Caissier MGR — M. Martin</span></div>
        <div className="my-2 border-t border-dashed border-slate-400" />

        {/* Lignes d'exemple */}
        {SAMPLE.map((l, i) => (
          <p key={i} className="flex justify-between gap-2">
            <span className="truncate">{l.q}× {l.nom}</span>
            <span className="shrink-0">{eur(l.pu * l.q)}</span>
          </p>
        ))}

        <div className="my-2 border-t border-dashed border-slate-400" />
        {/* Récap TVA (mention verrouillée — toujours imprimée) */}
        <p className="font-bold">RÉCAP TVA</p>
        {[10, 5.5, 0].filter((t) => tvaByRate[t]).map((t) => (
          <p key={t} className="flex justify-between gap-2">
            <span>{t.toLocaleString("fr-FR")} % — HT {eur(tvaByRate[t].ht)}</span>
            <span>TVA {eur(tvaByRate[t].tva)}</span>
          </p>
        ))}
        <p className="mt-1 flex justify-between font-bold text-xs"><span>TOTAL TTC</span><span>{eur(total)}</span></p>
        <p className="flex justify-between"><span>PAIEMENT</span><span>CARTE — x1234</span></p>

        <div className="my-2 border-t border-dashed border-slate-400" />
        <p className="text-center">Empreinte : A1B2C3D4…</p>
        <p className="text-center">Clôture Z signée — NF525</p>
        {(template?.mentions || "").split("\n").filter(Boolean).map((m, i) => (
          <p key={i} className="text-center italic">{m}</p>
        ))}
        <div className="mt-2 border-t border-dashed border-slate-400" />
        <p className="text-center text-[9px] text-slate-500">~ Aperçu approchant — rendu réel à l'impression (ESC/POS) ~</p>
      </div>
    </div>
  );
}
