"use strict";
// Vérification du chaînage SHA-256 du journal répliqué (FISC-2, SYNC-2).
// Exécution : make test (docker compose exec web npm test) — jamais sur l'hôte.
// Sortie : 0 si la chaîne est intacte pour chaque (restaurant, poste), 1 sinon.
const { pool } = require("../lib/db");

async function main() {
  const r = await pool.query(
    `SELECT restaurant_id, poste, seq,
            hash_prev IS DISTINCT FROM LAG(hash_self) OVER (
              PARTITION BY restaurant_id, poste ORDER BY seq
            ) AS rupture,
            LAG(hash_self) OVER (
              PARTITION BY restaurant_id, poste ORDER BY seq
            ) IS NULL AS genesis
     FROM journal_replica
     ORDER BY restaurant_id, poste, seq`
  );
  // Invariant FISC-2 : pour toute écriture qui suit une autre (LAG non nul),
  // hash_prev = hash_self précédent. La première écriture d'un poste porte le
  // hash de genèse de la tablette (valeur initiale, pas forcément NULL).
  const ruptures = r.rows.filter((x) => !x.genesis && x.rupture);
  const counts = await pool.query(
    `SELECT (SELECT COUNT(*) FROM journal_replica) AS ecritures,
            (SELECT COUNT(*) FROM clotures) AS clotures`
  );
  const c = counts.rows[0];
  console.log(`Journal : ${c.ecritures} écritures, ${c.clotures} clôtures Z`);
  if (ruptures.length > 0) {
    for (const x of ruptures) {
      console.error(`RUPTURE de chaînage : poste=${x.poste} restaurant=${x.restaurant_id} seq=${x.seq}`);
    }
    console.error(`Chaînage INVALIDE — ${ruptures.length} écriture(s) en rupture (FISC-2 violé).`);
    process.exit(1);
  }
  console.log("Chaînage SHA-256 vérifié : intact (FISC-2 ✓).");
  await pool.end();
}

main().catch((e) => { console.error("Échec du contrôle de chaînage :", e.message); process.exit(1); });
