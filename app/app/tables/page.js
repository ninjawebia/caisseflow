import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import TablesClient from "../../components/TablesClient";

// S-05 — Tables & rooms (BO-3). Gérant only.
export default async function TablesPage() {
  const { user, licence, denied } = await pageContext("tables");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );
  const rows = await pool.query(
    `SELECT id, nom, salle, places, actif FROM tables_resto WHERE restaurant_id=$1 ORDER BY salle, nom`,
    [user.restaurantId]
  );
  return (
    <Shell user={user} active="/tables" licence={licence}>
      <PageHeader title="Tables & salles" subtitle="Plan de salle synchronisé vers la caisse et les terminaux (BO-3)" />
      <TablesClient initial={rows.rows} />
    </Shell>
  );
}
