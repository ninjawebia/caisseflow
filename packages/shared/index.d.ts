// Types partagés CaisseFlow (NF525 + DTO API) — consommés par apps/web et apps/mobile.

/** Types d'événements du journal NF525 (FISC-1). */
export type NF525EventType =
  | "VENTE" | "PAIEMENT" | "TICKET" | "ANNULATION" | "REMISE"
  | "CHANGEMENT_PRIX" | "SESSION_OUVERTURE" | "SESSION_FERMETURE"
  | "CHANGEMENT_HEURE" | "CLOTURE_Z" | "IMPRESSION";

/** Taux de TVA restauratifs autorisés. */
export type TauxTva = 0 | 5.5 | 10 | 20;

/** Écriture du journal (append-only) — SYNC-1/FISC-2. */
export interface JournalEntry {
  uuidOp: string;          // UUID v4 généré côté appareil (déduplication)
  seq: number;             // numérotation continue par poste
  type: NF525EventType;
  timestamp: string;       // horodatage local (ISO 8601, jamais réécrit)
  userMatricule: string;
  validatorMatricule?: string;
  motif?: string;
  hashPrev: string;        // SHA-256 hex de l'écriture précédente
  hashSelf: string;        // SHA-256(hashPrev || payload canonique)
  payload: unknown;        // JSON canonique
}

/** Résultat de validation de DTO (mêmes règles serveur/client). */
export interface DtoResult<T> {
  ok: boolean;
  error?: string;
  value?: T;
}

export declare function validateArticle(body: unknown): DtoResult<{ nom: string; prix_ttc: number; taux_tva: TauxTva }>;
export declare function validateTable(body: unknown): DtoResult<{ nom: string; salle: string; places: number }>;
export declare function validateUserMobile(body: unknown): DtoResult<{ matricule: string; nom: string; role: string; pin: string }>;
export declare function validateCategory(body: unknown): DtoResult<{ nom: string; position: number }>;

export declare const NF525_EVENT_TYPES: readonly NF525EventType[];
export declare const EVENT_TYPES_WITH_VALIDATOR: readonly ("ANNULATION" | "REMISE" | "CHANGEMENT_PRIX")[];
export declare const TAUX_TVA: readonly TauxTva[];
export declare const PRIX_MIN: 0.01;
export declare const PRIX_MAX: 10000;
