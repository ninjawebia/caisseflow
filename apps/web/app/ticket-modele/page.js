import { pool } from "../../lib/db";
import { pageContext, LoginRequired } from "../../lib/pages";
import { Shell } from "../../components/Shell";
import { PageHeader } from "../../components/ui";
import TicketClient from "../../components/TicketClient";

// S-11 — Ticket template (IMP-4). Gérant only.
export default async function TicketPage() {
  const { user, licence, denied } = await pageContext("ticket");
  if (!user || denied) return (
    <main className="min-h-screen px-4"><LoginRequired denied={denied} /></main>
  );

  const tpl = await pool.query(
    "SELECT logo_text, mentions FROM ticket_template WHERE restaurant_id=$1", [user.restaurantId]
  );
  const rest = await pool.query(
    "SELECT nom, siret, adresse FROM restaurants WHERE id=$1", [user.restaurantId]
  );

  const legal = [
    { label: "Raison sociale", value: rest.rows[0]?.nom || "—" },
    { label: "SIRET", value: rest.rows[0]?.siret || "—" },
    { label: "Adresse", value: rest.rows[0]?.adresse || "—" },
    { label: "Date & heure d'encaissement", value: "imprimées à la seconde (NF525)" },
    { label: "Numéro de ticket / séquence", value: "POSTE-01-NNNNNN — numérotation continue" },
    { label: "Détail TVA par taux", value: "5,5 / 10 / 20 % — montants HT et TVA" },
    { label: "Empreinte de l'écriture", value: "8 premiers caractères du hash SHA-256 (IMP-5)" },
    { label: "Clôture Z signée", value: "signature du cachet journalière" },
  ];

  return (
    <Shell user={user} active="/ticket-modele" licence={licence}>
      <PageHeader title="Modèle de ticket" subtitle="Champs libres personnalisables — mentions légales NF525 verrouillées (IMP-4)" />
      <TicketClient template={tpl.rows[0] || { logo_text: "", mentions: "" }} legal={legal}
        restaurant={{ nom: rest.rows[0]?.nom || "", siret: rest.rows[0]?.siret || "", adresse: rest.rows[0]?.adresse || "" }} />
    </Shell>
  );
}
