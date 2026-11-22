import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import MenuClient from "../../components/MenuClient";
import { ensureDefaults, listPresets } from "../../lib/presets";

// S-03 — Menu & TVA (BO-1). Gérant only; other roles see the 403 state.
export default async function MenuPage() {
  const { user, licence, denied } = await pageContext("menu");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  // Styles d'image : seuls ceux du contexte « menu » s'appliquent à la carte
  // (les contextes ticket/kiosque/bo restent administrés depuis /apparence).
  await ensureDefaults(user.restaurantId);
  const presets = (await listPresets(user.restaurantId))
    .filter((p) => p.contexte === "menu")
    .map((p) => ({ id: p.id, nom: p.nom, forme: p.forme, cadrage: p.cadrage, ratio: p.ratio, rayon: Number(p.rayon), ombre: p.ombre, par_defaut: p.par_defaut, contexte: p.contexte }));

  const cats = await pool.query(
    `SELECT c.id, c.nom, c.position, c.actif, c.photo_hash, c.preset_id, COUNT(a.id)::int AS nb_articles
     FROM categories c LEFT JOIN articles a ON a.categorie_id = c.id
     WHERE c.restaurant_id = $1
     GROUP BY c.id ORDER BY c.position, c.nom`,
    [user.restaurantId]
  );
  const arts = await pool.query(
    `SELECT a.id, a.nom, a.prix_ttc, a.taux_tva, a.actif, a.categorie_id, a.photo_hash, a.preset_id,
            c.nom AS categorie_nom
     FROM articles a LEFT JOIN categories c ON c.id = a.categorie_id
     WHERE a.restaurant_id=$1 ORDER BY c.position NULLS LAST, a.nom`,
    [user.restaurantId]
  );

  return (
    <Shell user={user} active="/menu" licence={licence}>
      <PageHeader title="Menu & TVA" subtitle="La carte synchronisée vers la tablette caisse et les terminaux (BO-1)" />
      <MenuClient
        categories={cats.rows}
        articles={arts.rows.map((r) => ({ ...r, prix_ttc: Number(r.prix_ttc) }))}
        presets={presets}
      />
    </Shell>
  );
}
