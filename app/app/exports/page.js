import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import ExportsClient from "../../components/ExportsClient";

// S-08 — Exports (BO-5). Gérant, expert-comptable et auditeur (PRD 3.2).
// Admin plateforme : pas d'accès aux données fiscales du restaurant.
export default async function ExportsPage() {
  const { user, licence, denied } = await pageContext("exports");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const rows = await pool.query(
    `SELECT e.id, e.type, e.format, e.from_period, e.to_period, e.fichier, e.empreinte, e.created_at
     FROM exports e WHERE e.restaurant_id=$1 ORDER BY e.created_at DESC LIMIT 100`,
    [user.restaurantId]
  );

  return (
    <Shell user={user} active="/exports" licence={licence}>
      <PageHeader title="Exports fiscaux" subtitle="Fichiers signés (empreinte SHA-256) pour l'expert-comptable et le contrôle fiscal — demandeur tracé (BO-5)" />
      <ExportsClient initial={rows.rows} />
    </Shell>
  );
}
