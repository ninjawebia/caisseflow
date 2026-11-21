import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { Card, PageHeader, StatusPill, EmptyState } from "../../components/ui";
import { verifyChainsByPoste } from "../../lib/fiscal";
import { formatDateTime } from "../../lib/format";

// S-07 — Replica journal, read-only (BO-6). Full SHA-256 chain verification on
// every load (FISC-7): any broken link is displayed as a blocking incident.
export default async function JournalPage({ searchParams }) {
  const { user, licence, denied } = await pageContext("journal");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const sp = await searchParams;
  const type = ["VENTE", "PAIEMENT", "TICKET", "ANNULATION", "REMISE", "CHANGEMENT_PRIX", "SESSION", "HORLOGE", "CLOTURE_Z", "IMPRESSION"].includes(sp.type) ? sp.type : null;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  // Full chain check, une chaîne indépendante PAR POSTE (numérotation POSTE-XX-…).
  const all = await pool.query(
    `SELECT poste, seq, hash_prev, hash_self, payload FROM journal_replica
     WHERE restaurant_id=$1 ORDER BY poste, seq`,
    [user.restaurantId]
  );
  const chain = verifyChainsByPoste(all.rows.map((r) => ({
    poste: r.poste, seq: r.seq, hashPrev: r.hash_prev, hashSelf: r.hash_self, payload: r.payload,
  })));

  const filters = [user.restaurantId];
  let where = "restaurant_id=$1";
  if (type) { filters.push(type); where += ` AND type=$${filters.length}`; }
  if (q) { filters.push(`%${q}%`); where += ` AND (ref ILIKE $${filters.length} OR user_matricule ILIKE $${filters.length} OR payload::text ILIKE $${filters.length})`; }

  const rows = await pool.query(
    `SELECT id, poste, seq, ref, type, "timestamp", user_matricule, validator_matricule, motif, hash_self, payload,
            CASE WHEN type IN ('PAIEMENT','ANNULATION','REMISE') THEN (payload->>'montant')::numeric
                 WHEN type='VENTE' THEN (payload->>'total')::numeric
                 ELSE NULL END AS amount
     FROM journal_replica WHERE ${where}
     ORDER BY "timestamp" DESC LIMIT 200`,
    filters
  );

  const typesList = ["VENTE", "PAIEMENT", "TICKET", "ANNULATION", "REMISE", "CHANGEMENT_PRIX", "SESSION", "HORLOGE", "CLOTURE_Z", "IMPRESSION"];

  return (
    <Shell user={user} active="/journal" licence={licence}>
      <PageHeader title="Journal répliqué" subtitle="Lecture seule — append-only, le serveur ne corrige jamais le journal (BO-6, SYNC-2)">
        <StatusPill tone={chain.ok ? "success" : "danger"}>{chain.ok ? `Chaînage SHA-256 vérifié${chain.postes > 1 ? ` (${chain.postes} postes)` : ""}` : `Rupture ${chain.poste} · seq ${chain.brokenSeq}`}</StatusPill>
      </PageHeader>

      {!chain.ok && (
        <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 text-sm p-4 rounded-xl">
          <strong>Incident de chaînage détecté sur {chain.poste} à la séquence {chain.brokenSeq}</strong> ({chain.reason}) —
          investigation requise. Aucune correction automatique n'est possible par conception.
        </div>
      )}

      <Card className="p-6">
        <form className="flex flex-col sm:flex-row gap-3 mb-4" action="/journal" data-form="journal-filter">
          <input name="q" defaultValue={q} placeholder="Recherche : référence, matricule, contenu…"
            className="h-10 flex-1 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
          <select name="type" defaultValue={type || ""}
            className="h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow">
            <option value="">Tous les types</option>
            {typesList.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="submit" data-action="filter-journal"
            className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">Filtrer</button>
        </form>

        {rows.rowCount === 0 ? (
          <EmptyState icon="🔍" title="Aucune écriture trouvée"
            description={q || type ? "Aucune écriture ne correspond aux filtres. Modifiez la recherche." : "Le journal répliqué est vide — en attente de synchronisation de la tablette caisse."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Référence</th><th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Horodatage</th><th className="py-2 pr-4">Utilisateur</th>
                  <th className="py-2 pr-4">Motif / validateur</th>
                  <th className="py-2 pr-4 text-right">Montant</th>
                  <th className="py-2 text-right">Empreinte</th>
                </tr>
              </thead>
              <tbody>
                {rows.rows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs">{e.ref}</td>
                    <td className="py-2 pr-4"><StatusPill tone={e.type === "ANNULATION" ? "danger" : e.type === "CLOTURE_Z" ? "warning" : "neutral"}>{e.type}</StatusPill></td>
                    <td className="py-2 pr-4 text-slate-500 text-xs">{formatDateTime(e.timestamp)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{e.user_matricule}{e.validator_matricule ? ` + ${e.validator_matricule}` : ""}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500 max-w-40 truncate" title={e.motif || ""}>{e.motif || "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{e.amount !== null ? Number(e.amount).toFixed(2) + " €" : "—"}</td>
                    <td className="py-2 text-right font-mono text-xs text-slate-400" title={e.hash_self}>{e.hash_self.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  );
}
