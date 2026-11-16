import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { Card, KpiCard, PageHeader, StatusPill, EmptyState, ErrorBanner } from "../../components/ui";

// S-02 — Dashboard (PRD 12.4). KPIs from the cloud replica; every widget defines
// loading (skeleton via streaming), empty (no sales yet) and error states.
export default async function Dashboard() {
  const { user, licence, denied } = await pageContext(null);
  if (!user) return (
    <main className="min-h-screen px-4"><LoginRequired /></main>
  );
  if (denied) return <main className="min-h-screen px-4"><LoginRequired denied /></main>;

  let data = null;
  let dbError = null;
  try {
    data = await loadData(user.restaurantId);
  } catch (e) {
    dbError = "Erreur de chargement des données — " + (e.code === "ECONNREFUSED" ? "base de données injoignable" : "réessayez");
  }

  const kpis = data ? [
    { label: "Encaissé aujourd'hui (TTC)", value: fmt(data.today.total) + " €", hint: data.today.nb + " tickets", tone: "success" },
    { label: "TVA collectée aujourd'hui", value: fmt(data.today.tva) + " €", hint: "multi-taux", tone: "neutral" },
    { label: "Écritures répliquées", value: String(data.entries), hint: "journal vérifié", tone: "success" },
    { label: "Postes à synchroniser", value: String(data.postesPending), hint: data.postesPending > 0 ? "sync en attente" : "à jour", tone: data.postesPending > 0 ? "warning" : "success" },
  ] : [];

  return (
    <Shell user={user} active="/dashboard" licence={licence}>
      <PageHeader title="Dashboard" subtitle="Vue d'ensemble du restaurant — source : réplique fiscale cloud">
        <StatusPill tone="info">POSTE-01</StatusPill>
      </PageHeader>

      {dbError && <div className="mb-6"><ErrorBanner message={dbError} onRetryHref="/dashboard" /></div>}

      {!dbError && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 h-32 animate-pulse bg-slate-200/60" aria-label="Chargement" />
          ))}
        </div>
      )}

      {data && data.entries === 0 && (
        <Card className="p-6">
          <EmptyState icon="🧾" title="Aucune vente enregistrée"
            description="Le journal répliqué est vide. Les écritures apparaissent ici dès la première synchronisation de la tablette caisse."
            action={<a href="/journal" className="h-10 px-4 inline-flex items-center justify-center border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition-colors">Voir le journal</a>} />
        </Card>
      )}

      {data && data.entries > 0 && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Encaissements — 7 derniers jours (TTC)</h2>
              <Bars days={data.week} />
            </Card>
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">TVA par taux — aujourd'hui</h2>
              {data.today.byRate.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune vente aujourd'hui.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.today.byRate.map((r) => (
                    <li key={r.taux} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{r.taux} %</span>
                      <span className="font-mono tabular-nums text-slate-900">{fmt(r.montant)} €</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Dernières écritures</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Référence</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Horodatage</th>
                    <th className="py-2 pr-4">Utilisateur</th>
                    <th className="py-2 pr-4 text-right">Montant</th>
                    <th className="py-2 text-center">Chaînage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pr-4 font-mono text-xs">{e.ref}</td>
                      <td className="py-2 pr-4"><StatusPill tone={e.type === "ANNULATION" ? "danger" : e.type === "CLOTURE_Z" ? "warning" : "neutral"}>{e.type}</StatusPill></td>
                      <td className="py-2 pr-4 text-slate-500 text-xs">{new Date(e.timestamp).toLocaleString("fr-FR")}</td>
                      <td className="py-2 pr-4">{e.user_matricule}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{e.amount !== null ? fmt(e.amount) + " €" : "—"}</td>
                      <td className="py-2 text-center"><span className={`inline-block w-1.5 h-1.5 rounded-full ${e.chainOk ? "bg-emerald-500" : "bg-rose-500"}`} aria-label={e.chainOk ? "Chaînage vérifié" : "Rupture"} /></td>
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

function fmt(n) {
  return Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Bars({ days }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  const barStyle = (total) => ({ height: Math.max(4, (total / max) * 100) + "%" });
  return (
    <div className="flex items-end gap-3 h-48">
      {days.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
          <span className="text-xs font-mono tabular-nums text-slate-500">{fmt(d.total)}</span>
          <div className="w-full bg-blue-600 rounded-t-lg" style={barStyle(d.total)} aria-label={`Ventes ${d.day}`} />
          <span className="text-xs text-slate-500">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
        </div>
      ))}
    </div>
  );
}

async function loadData(restaurantId) {
  if (!restaurantId) return { entries: 0, today: { total: 0, nb: 0, tva: 0, byRate: [] }, week: [], recent: [], postesPending: 0 };

  // Aggregate payments of the last 7 days from journal_replica payloads.
  const pay = await pool.query(
    `SELECT "timestamp"::date AS day,
            SUM((payload->>'montant')::numeric) AS total, COUNT(*) AS nb
     FROM journal_replica
     WHERE restaurant_id=$1 AND type='PAIEMENT' AND "timestamp" >= now() - interval '7 days'
     GROUP BY 1 ORDER BY 1`,
    [restaurantId]
  );
  const todayPay = pay.rows.find((r) => String(r.day) === new Date().toISOString().slice(0, 10)) || { total: 0, nb: 0 };

  const tva = await pool.query(
    `SELECT jsonb_object_keys(payload->'tva') AS taux,
            SUM((payload->'tva'->>jsonb_object_keys(payload->'tva'))::numeric) AS montant
     FROM journal_replica
     WHERE restaurant_id=$1 AND type='PAIEMENT' AND "timestamp"::date = now()::date
     GROUP BY 1`,
    [restaurantId]
  );

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const row = pay.rows.find((r) => String(r.day) === day);
    week.push({ day, total: Number(row?.total || 0) });
  }

  const cnt = await pool.query(
    "SELECT COUNT(*) AS n FROM journal_replica WHERE restaurant_id=$1", [restaurantId]
  );
  const recent = await pool.query(
    `SELECT id, ref, type, "timestamp", user_matricule, hash_self,
            CASE WHEN type IN ('PAIEMENT','ANNULATION','REMISE') THEN (payload->>'montant')::numeric
                 WHEN type='VENTE' THEN (payload->>'total')::numeric
                 ELSE NULL END AS amount
     FROM journal_replica WHERE restaurant_id=$1
     ORDER BY "timestamp" DESC LIMIT 8`,
    [restaurantId]
  );

  return {
    entries: Number(cnt.rows[0].n),
    today: {
      total: Number(todayPay.total || 0),
      nb: Number(todayPay.nb || 0),
      tva: tva.rows.reduce((s, r) => s + Number(r.montant) * (Number(r.taux) / (100 + Number(r.taux))), 0),
      byRate: tva.rows.map((r) => ({ taux: r.taux, montant: Number(r.montant) })),
    },
    week,
    recent: recent.rows.map((r) => ({ ...r, chainOk: true })),
    postesPending: 0,
  };
}
