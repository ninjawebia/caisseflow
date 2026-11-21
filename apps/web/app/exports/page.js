import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import ExportsClient from "../../components/ExportsClient";
import { parsePage, clampPage } from "../../lib/pagination";

const PAGE_SIZE = 20;

// S-08 — Exports (BO-5). Gérant, expert-comptable et auditeur (PRD 3.2).
// Admin plateforme : pas d'accès aux données fiscales du restaurant.
export default async function ExportsPage({ searchParams }) {
  const { user, licence, denied } = await pageContext("exports");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const sp = await searchParams;
  const count = await pool.query(
    "SELECT COUNT(*)::int AS n FROM exports WHERE restaurant_id=$1",
    [user.restaurantId]
  );
  const total = count.rows[0].n;
  const page = clampPage(parsePage(sp.page), total, PAGE_SIZE);
  const rows = await pool.query(
    `SELECT e.id, e.type, e.format, e.from_period, e.to_period, e.fichier, e.empreinte, e.created_at
     FROM exports e WHERE e.restaurant_id=$1
     ORDER BY e.created_at DESC, e.id DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    [user.restaurantId]
  );

  return (
    <Shell user={user} active="/exports" licence={licence}>
      <PageHeader title="Exports fiscaux" subtitle="Fichiers signés (empreinte SHA-256) pour l'expert-comptable et le contrôle fiscal — demandeur tracé (BO-5)" />
      <ExportsClient initial={rows.rows} pagination={{ page, total, limit: PAGE_SIZE }} />
    </Shell>
  );
}
