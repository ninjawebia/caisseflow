import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { Card, PageHeader, EmptyState, StatusPill } from "../../components/ui";

// S-10 — Audit trail, read-only (PRD 10.5, BO-7). Every back-office action
// lands here; the table itself is append-only (UPDATE/DELETE blocked in SQL).
export default async function AuditPage({ searchParams }) {
  const { user, licence, denied } = await pageContext("audit");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const action = typeof sp.action === "string" && sp.action ? sp.action : null;

  const params = [];
  let where = "1=1";
  if (q) { params.push("%" + q + "%"); where += " AND (actor_email ILIKE $" + (params.length) + " OR entity ILIKE $" + (params.length) + " OR entity_id::text ILIKE $" + (params.length) + ")"; }
  if (action) { params.push(action); where += " AND action = $" + (params.length); }

  const rows = await pool.query(
    `SELECT id, actor_email, action, entity, entity_id, diff_summary, "timestamp"
     FROM audit_log WHERE ` + where + ` ORDER BY "timestamp" DESC LIMIT 200`,
    params
  );
  const actions = await pool.query("SELECT DISTINCT action FROM audit_log ORDER BY action");
  const count = await pool.query("SELECT COUNT(*) AS n FROM audit_log");

  const toneFor = (a) =>
    a === "login_failure" ? "warning" : a === "export" ? "info" :
    ["disable", "delete"].includes(a) ? "danger" : "neutral";

  return (
    <Shell user={user} active="/audit" licence={licence}>
      <PageHeader title="Journal d'audit" subtitle={"Piste d'audit du back-office — " + count.rows[0].n + " événements, lecture seule (BO-7, 10.5)"}>
        <StatusPill tone="neutral">append-only</StatusPill>
      </PageHeader>

      <Card className="p-6">
        <form action="/audit" className="flex flex-col sm:flex-row gap-3 mb-4" data-form="audit-filter">
          <input name="q" defaultValue={q} placeholder="Recherche : e-mail, entité, identifiant…"
            className="h-10 flex-1 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow" />
          <select name="action" defaultValue={action || ""}
            className="h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 transition-shadow">
            <option value="">Toutes les actions</option>
            {actions.rows.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
          <button type="submit" data-action="filter-audit"
            className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">Filtrer</button>
        </form>

        {rows.rowCount === 0 ? (
          <EmptyState icon="🛡️" title="Aucun événement" description="Aucun événement d'audit ne correspond aux filtres appliqués." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Horodatage</th>
                  <th className="py-2 pr-4">Acteur</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Entité</th>
                  <th className="py-2 text-left">Détail</th>
                </tr>
              </thead>
              <tbody>
                {rows.rows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 pr-4 text-slate-500 text-xs whitespace-nowrap">{new Date(e.timestamp).toLocaleString("fr-FR")}</td>
                    <td className="py-2 pr-4 text-xs">{e.actor_email || "—"}</td>
                    <td className="py-2 pr-4"><StatusPill tone={toneFor(e.action)}>{e.action}</StatusPill></td>
                    <td className="py-2 pr-4 font-mono text-xs">{e.entity}{e.entity_id ? " #" + String(e.entity_id).slice(0, 8) : ""}</td>
                    <td className="py-2 font-mono text-xs text-slate-500 max-w-md truncate" title={JSON.stringify(e.diff_summary)}>{JSON.stringify(e.diff_summary)}</td>
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
