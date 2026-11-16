"use strict";
// Deterministic demo seed (PRD 13.2). Run: npm run db:seed
// Demo credentials are hashed at insert time (bcrypt) — see HANDOFF for values.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("../lib/db");
const { nextHash, shortHash, sha256hex } = require("../lib/fiscal");

const demoWebUsers = [
  { email: "gerant@local.test", role: "gerant", nom: "Camille Gérant", pwd: "Gerant123!" },
  { email: "comptable@local.test", role: "expert_comptable", nom: "Expert Compta", pwd: "Compta123!" },
  { email: "auditeur@local.test", role: "auditeur", nom: "Auditeur Fiscal", pwd: "Audit123!" },
  { email: "admin@local.test", role: "admin_plateforme", nom: "Admin Plateforme", pwd: "Admin123!" },
];

const demoMobileUsers = [
  { matricule: "MGR", nom: "Camille Gérant", role: "gerant", pin: "1234" },
  { matricule: "SEC", nom: "Sam Second", role: "second", pin: "2345" },
  { matricule: "S07", nom: "Sofia Serveuse", role: "serveur", pin: "3456" },
  { matricule: "K01", nom: "Karim Cuisine", role: "cuisine", pin: "4567" },
];

const categories = ["Entrées", "Plats", "Desserts", "Boissons"];
const articles = [
  ["Entrées", "Œufs mayonnaise", 6.5, 10],
  ["Entrées", "Salade de chèvre", 9.0, 10],
  ["Entrées", "Soupe à l'oignon", 7.5, 10],
  ["Plats", "Bœuf bourguignon", 18.9, 10],
  ["Plats", "Magret de canard", 21.5, 10],
  ["Plats", "Pavé de saumon", 19.5, 10],
  ["Plats", "Croque-monsieur", 9.8, 10],
  ["Desserts", "Crème brûlée", 7.0, 10],
  ["Desserts", "Café gourmand", 7.5, 10],
  ["Desserts", "Tiramisu", 6.5, 10],
  ["Boissons", "Café expresso", 2.0, 5.5],
  ["Boissons", "Verre de vin rouge", 4.5, 20],
  ["Boissons", "Eau minérale 50cl", 2.5, 5.5],
  ["Boissons", "Bière pression 25cl", 4.0, 20],
];
const tables = [
  ["T1", 2], ["T2", 2], ["T3", 4], ["T4", 4], ["T5", 6], ["T6", 4], ["T7", 2], ["T8", 8],
];

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const rest = (
      await c.query(
        "INSERT INTO restaurants (nom, siret, adresse) VALUES ($1,$2,$3) RETURNING id",
        ["Le Petit Bistrot (Pilote)", "12345678900012", "12 rue des Lilas, 75011 Paris"]
      )
    ).rows[0].id;

    await c.query(
      "INSERT INTO licences (restaurant_id, etat) VALUES ($1, 'active')", [rest]
    );

    for (const u of demoWebUsers) {
      const hash = bcrypt.hashSync(u.pwd, 10);
      await c.query(
        "INSERT INTO users_web (restaurant_id, email, hashedPassword, role, nom) VALUES ($1,$2,$3,$4,$5)",
        [u.role === "admin_plateforme" ? null : rest, u.email, hash, u.role, u.nom]
      );
    }

    for (const m of demoMobileUsers) {
      await c.query(
        "INSERT INTO users_mobile (restaurant_id, matricule, nom, role, pin_hash) VALUES ($1,$2,$3,$4,$5)",
        [rest, m.matricule, m.nom, m.role, bcrypt.hashSync(m.pin, 10)]
      );
    }

    // Device token for the cashier tablet (hashed at rest — PRD 6.2).
    const demoDeviceToken = "device-token-demo-POSTE-01";
    await c.query(
      "INSERT INTO device_tokens (restaurant_id, poste, token_hash) VALUES ($1,$2,$3)",
      [rest, "POSTE-01", crypto.createHash("sha256").update(demoDeviceToken).digest("hex")]
    );

    const catIds = {};
    for (let i = 0; i < categories.length; i++) {
      const id = (await c.query(
        "INSERT INTO categories (restaurant_id, nom, position) VALUES ($1,$2,$3) RETURNING id",
        [rest, categories[i], i]
      )).rows[0].id;
      catIds[categories[i]] = id;
    }
    for (const [cat, nom, prix, tva] of articles) {
      await c.query(
        "INSERT INTO articles (restaurant_id, categorie_id, nom, prix_ttc, taux_tva) VALUES ($1,$2,$3,$4,$5)",
        [rest, catIds[cat], nom, prix, tva]
      );
    }
    for (const [nom, places] of tables) {
      await c.query(
        "INSERT INTO tables_resto (restaurant_id, nom, places) VALUES ($1,$2,$3)",
        [rest, nom, places]
      );
    }

    // Seed a verifiable fiscal journal (yesterday + today) with a closed Z.
    const serveuse = "S07";
    const arts = (await c.query(
      "SELECT id, nom, prix_ttc, taux_tva FROM articles WHERE restaurant_id=$1 AND categorie_id=$2 ORDER BY nom",
      [rest, catIds["Plats"]]
    )).rows;
    const jours = [new Date(Date.now() - 86400000), new Date(Date.now())];
    let seq = 0;
    // Genesis anchor: SHA-256 of the literal "GENESIS" (64 hex, chain start).
    let hashPrev = sha256hex("GENESIS");
    let dayTotals = {};
    for (const jour of jours) {
      const d = new Date(jour); d.setHours(12, 0, 0, 0);
      dayTotals = {};
      for (let t = 0; t < 5; t++) {
        const art = arts[t % arts.length];
        seq += 1;
        const payload = {
          commande: `CMD-${d.toISOString().slice(0, 10)}-${t + 1}`,
          type_cmd: t % 2 === 0 ? "salle" : "comptoir",
          lignes: [{ nom: art.nom, qte: 1, pu: Number(art.prix_ttc) }],
          total: Number(art.prix_ttc),
        };
        const hs = nextHash(hashPrev, payload);
        await c.query(
          `INSERT INTO journal_replica (restaurant_id, poste, seq, ref, uuid_op, type, "timestamp", user_matricule, payload, hash_prev, hash_self)
           VALUES ($1,$2,$3,$4,$5,'VENTE',$6,$7,$8,$9,$10)`,
          [rest, "POSTE-01", seq, `POSTE-01-${String(seq).padStart(6, "0")}`,
            crypto.randomUUID(), d.toISOString(), serveuse, payload, hashPrev, hs]
        );
        hashPrev = hs;
        // Payment entry for each sale.
        seq += 1;
        const pay = { commande: payload.commande, moyen: t % 2 === 0 ? "carte_tpe" : "especes", montant: payload.total, rendu: 0 };
        const hs2 = nextHash(hashPrev, pay);
        await c.query(
          `INSERT INTO journal_replica (restaurant_id, poste, seq, ref, uuid_op, type, "timestamp", user_matricule, payload, hash_prev, hash_self)
           VALUES ($1,$2,$3,$4,$5,'PAIEMENT',$6,$7,$8,$9,$10)`,
          [rest, "POSTE-01", seq, `POSTE-01-${String(seq).padStart(6, "0")}`,
            crypto.randomUUID(), d.toISOString(), serveuse, pay, hashPrev, hs2]
        );
        hashPrev = hs2;
        const key = String(art.taux_tva);
        dayTotals[key] = (dayTotals[key] || 0) + payload.total;
      }
      // Daily Z closing, signed locally on the tablet (signature simulated by the seed).
      seq += 1;
      const totals = Object.fromEntries(Object.entries(dayTotals).map(([k, v]) => [k, Number(v.toFixed(2))]));
      const zPayload = { date: d.toISOString().slice(0, 10), totals, nb_tickets: 5, first_seq: seq - 10, last_seq: seq - 1 };
      const hsZ = nextHash(hashPrev, zPayload);
      const seal = crypto.createHash("sha256").update("SEAL" + hsZ).digest("hex");
      await c.query(
        `INSERT INTO journal_replica (restaurant_id, poste, seq, ref, uuid_op, type, "timestamp", user_matricule, payload, hash_prev, hash_self)
         VALUES ($1,$2,$3,$4,$5,'CLOTURE_Z',$6,$7,$8,$9,$10)`,
        [rest, "POSTE-01", seq, `POSTE-01-${String(seq).padStart(6, "0")}`,
          crypto.randomUUID(), new Date(d.getTime() + 3600000 * 14).toISOString(), "MGR", zPayload, hashPrev, hsZ]
      );
      hashPrev = hsZ;
      await c.query(
        `INSERT INTO clotures (restaurant_id, date_service, poste, totals, nb_tickets, first_seq, last_seq, last_hash, seal_signature)
         VALUES ($1,$2,'POSTE-01',$3,$4,$5,$6,$7,$8)`,
        [rest, d.toISOString().slice(0, 10), totals, 5, seq - 10, seq - 1, hsZ, seal]
      );
    }

    await c.query(
      "INSERT INTO ticket_template (restaurant_id, logo_text, mentions) VALUES ($1,$2,$3)",
      [rest, "Le Petit Bistrot", "Merci de votre visite — TVA incluse"]
    );

    await c.query(
      "INSERT INTO audit_log (actor_email, action, entity, entity_id, diff_summary) VALUES ($1,$2,$3,$4,$5)",
      ["seed@system", "seed", "database", rest, JSON.stringify({ source: "db/seed.js", tables: "all" })]
    );

    await c.query("COMMIT");
    console.log("Seed OK. Journal:", seq, "entries. Short last hash:", shortHash(hashPrev));
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("Seed failed:", e.message); process.exit(1); });
