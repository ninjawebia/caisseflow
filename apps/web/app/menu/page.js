import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import MenuClient from "../../components/MenuClient";

// S-03 — Menu & TVA (BO-1). Gérant only; other roles see the 403 state.
export default async function MenuPage() {
  const { user, licence, denied } = await pageContext("menu");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const cats = await pool.query(
    "SELECT id, nom, position FROM categories WHERE restaurant_id=$1 ORDER BY position", [user.restaurantId]
  );
  const arts = await pool.query(
    `SELECT a.id, a.nom, a.prix_ttc, a.taux_tva, a.actif, a.categorie_id, c.nom AS categorie_nom
     FROM articles a LEFT JOIN categories c ON c.id = a.categorie_id
     WHERE a.restaurant_id=$1 ORDER BY c.position NULLS LAST, a.nom`,
    [user.restaurantId]
  );

  return (
    <Shell user={user} active="/menu" licence={licence}>
      <PageHeader title="Menu & TVA" subtitle="La carte synchronisée vers la tablette caisse et les terminaux (BO-1)" />
      <MenuClient categories={cats.rows} articles={arts.rows.map((r) => ({ ...r, prix_ttc: Number(r.prix_ttc) }))} />
    </Shell>
  );
}
