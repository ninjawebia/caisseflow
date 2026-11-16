import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { Card, PageHeader, EmptyState, ErrorBanner } from "../../components/ui";

// S-06 — Sales reports (BO-4). Computed from the verified cloud replica.
export default async function ReportsPage({ searchParams }) {
  const { user, licence, denied } = await pageContext("reports");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const sp = await searchParams;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || "") ? sp.from : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || "") ? sp.to : new Date().toISOString().slice(0, 10);

  let data = null, dbError = null;
  try { data = await load(user.restaurantId, from, to); }
  catch (e) { dbError = "Erreur de chargement des rapports — réessayez"; }

  return (
    <Shell user={user} active="/rapports" licence={licence}>
      <PageHeader title="Rapports de ventes" subtitle="Totaux, TVA par taux, par serveur et par article — source : journal répliqué vérifié (BO-4)" />
      <Card className="p-4 mb-6">
        <form action="/rapports" className="flex flex-col sm:flex-row gap-3" data-form="report-filter">
          <div className="flex-1">
            <label htmlFor="r-from" className="block text-xs font-semibold text-slate-700 mb-1">Du</label>
            <input id="r-from" type="date" name="from" defaultValue={from} className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
          </div>
          <div className="flex-1">
            <label htmlFor="r-to" className="block text-xs font-semibold text-slate-700 mb-1">Au</label>
            <input id="r-to" type="date" name="to" defaultValue={to} className="h-10 w-full px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
          </div>
          <div className="flex items-end">
            <button type="submit" data-action="report-filter" className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">Appliquer</button>
          </div>
        </form>
      </Card>

      {dbError && <div className="mb-6"><ErrorBanner message={dbError} onRetryHref="/rapports" /></div>}

      {data && data.empty && (
        <Card className="p-6"><EmptyState icon="📊" title="Aucune donnée sur la période"
          description="Aucun paiement répliqué entre ces dates. Modifiez la période ou synchronisez la caisse." /></Card>
      )}

      {data && !data.empty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Totaux par jour</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200"><th className="py-2 pr-4">Date</th><th className="py-2 pr-4 text-right">Tickets</th><th className="py-2 text-right">TTC</th></tr></thead>
                <tbody>
                  {data.byDay.map((r) => (
                    <tr key={r.day} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pr-4">{frDate(r.day)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{r.nb}</td>
                      <td className="py-2 text-right font-mono tabular-nums font-medium">{Number(r.total).toFixed(2)} €</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="py-2 pr-4">Total période</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{data.grand.nb}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{Number(data.grand.total).toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Chiffre par taux de TVA</h2>
              <ul className="flex flex-col gap-3">
                {data.byRate.map((r) => (
                  <li key={r.taux} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">TVA {Number(r.taux)} %</span>
                    <span className="font-mono tabular-nums text-slate-900">{Number(r.total).toFixed(2)} €</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Par serveur</h2>
              <ul className="flex flex-col gap-3">
                {data.byServer.map((r) => (
                  <li key={r.matricule} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-slate-700">{r.matricule}</span>
                    <span className="font-mono tabular-nums text-slate-900">{Number(r.total).toFixed(2)} € ({r.nb})</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Top articles vendus</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200"><th className="py-2 pr-4">Article</th><th className="py-2 pr-4 text-right">Quantité</th><th className="py-2 text-right">Chiffre TTC</th></tr></thead>
                <tbody>
                  {data.byArticle.map((r) => (
                    <tr key={r.article} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pr-4 text-slate-900">{r.article}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{r.qte}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{Number(r.total).toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Shell>
  );
}

function frDate(iso) {
  return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : String(iso ?? "—");
}

async function load(restaurantId, from, to) {
  const range = `"timestamp" >= $2::date AND "timestamp" < ($3::date + interval '1 day')`;

  const byDay = await pool.query(
    `SELECT to_char("timestamp"::date, 'YYYY-MM-DD') AS day, COUNT(*) AS nb, SUM((payload->>'montant')::numeric) AS total
     FROM journal_replica WHERE restaurant_id=$1 AND type='PAIEMENT' AND ${range}
     GROUP BY 1 ORDER BY 1`, [restaurantId, from, to]
  );
  // TVA split: recompute rate shares from VENTE payloads (lignes carry unit rates
  // at sale time). We aggregate per rate from payment entries grouped by day.
  const tvaRows = await pool.query(
    `SELECT (payload->>'montant')::numeric AS montant, v.payload->'lignes' AS lignes
     FROM journal_replica v
     WHERE v.restaurant_id=$1 AND v.type='PAIEMENT' AND ${range}`,
    [restaurantId, from, to]
  );
  const byTaux = {};
  for (const row of tvaRows.rows) {
    const lignes = row.lignes || [];
    const totalLignes = lignes.reduce((s, l) => s + Number(l.pu || 0) * Number(l.qte || 1), 0) || Number(row.montant);
    for (const l of lignes) {
      const taux = String(l.tva ?? l.taux ?? "");
      if (taux === "") continue;
      const part = (Number(l.pu) * Number(l.qte)) / totalLignes * Number(row.montant);
      byTaux[taux] = (byTaux[taux] || 0) + part;
    }
  }
  const byServer = await pool.query(
    `SELECT user_matricule AS matricule, COUNT(*) AS nb, SUM((payload->>'montant')::numeric) AS total
     FROM journal_replica WHERE restaurant_id=$1 AND type='PAIEMENT' AND ${range}
     GROUP BY 1 ORDER BY total DESC`, [restaurantId, from, to]
  );
  const byArticle = await pool.query(
    `SELECT l->>'nom' AS article, SUM((l->>'qte')::int) AS qte, SUM((l->>'pu')::numeric * (l->>'qte')::int) AS total
     FROM journal_replica j, jsonb_array_elements(j.payload->'lignes') l
     WHERE j.restaurant_id=$1 AND j.type='VENTE' AND j."timestamp" >= $2::date AND j."timestamp" < ($3::date + interval '1 day')
     GROUP BY 1 ORDER BY total DESC LIMIT 20`, [restaurantId, from, to]
  );
  const grand = byDay.rows.reduce((s, r) => ({ total: s.total + Number(r.total), nb: s.nb + Number(r.nb) }), { total: 0, nb: 0 });
  return {
    empty: grand.nb === 0,
    byDay: byDay.rows,
    grand,
    byRate: Object.entries(byTaux).map(([taux, total]) => ({ taux, total })).sort((a, b) => Number(b.taux) - Number(a.taux)),
    byServer: byServer.rows,
    byArticle: byArticle.rows,
  };
}
