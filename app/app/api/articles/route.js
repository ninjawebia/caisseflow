import { cookies } from "next/headers";
import { getSessionUser, can } from "../../../lib/auth";
import { pool } from "../../../lib/db";
import { assertSameOrigin, json, audit } from "../../../lib/http";

// POST /api/articles — create (BO-1, gérant only, server-side re-validation).
export async function POST(req) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await getSessionUser(await cookies());
  if (!user || !can(user.role, "menu") || !user.restaurantId) return json({ error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => null);
  const nom = String(body?.nom || "").trim();
  const prix = Number(body?.prix_ttc);
  const tva = Number(body?.taux_tva);
  const cat = body?.categorie_id || null;
  const actif = body?.actif !== false;

  if (nom.length < 2 || nom.length > 80) return json({ error: "Nom obligatoire (2–80 caractères)" }, 400);
  if (!(prix > 0 && prix <= 10000)) return json({ error: "Prix invalide (0–10 000 €)" }, 400);
  if (![0, 5.5, 10, 20].includes(tva)) return json({ error: "Taux de TVA invalide" }, 400);

  const catOk = cat
    ? (await pool.query("SELECT 1 FROM categories WHERE id=$1 AND restaurant_id=$2", [cat, user.restaurantId])).rowCount > 0
    : true;
  if (!catOk) return json({ error: "Catégorie inconnue" }, 400);

  try {
    const r = await pool.query(
      `INSERT INTO articles (restaurant_id, categorie_id, nom, prix_ttc, taux_tva, actif)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, nom, prix_ttc, taux_tva, actif, categorie_id`,
      [user.restaurantId, cat, nom, prix, tva, actif]
    );
    const article = { ...r.rows[0], prix_ttc: Number(r.rows[0].prix_ttc), taux_tva: Number(r.rows[0].taux_tva) };
    await audit(user, "create", "articles", article.id, { nom, prix_ttc: prix, taux_tva: tva });
    return json({ article }, 201);
  } catch (e) {
    if (e.code === "23505") return json({ error: "Un article porte déjà ce nom" }, 409);
    return json({ error: "Erreur d'enregistrement" }, 500);
  }
}
