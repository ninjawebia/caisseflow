# Journal fiscal local (M2) — contrat, garanties, preuves

> Cœur NF525 du produit : le journal est **calculé, chaîné et conservé sur la
> tablette**, jamais sur le réseau. Le cloud n'est qu'un réplica d'archivage
> (FISC-8). Ce document décrit ce que M2 garantit et comment c'est vérifié.

## 1. Ce que garantit le module

| Exigence | Garantie technique | Preuve exécutable |
| --- | --- | --- |
| **FISC-1** append-only | Triggers SQLite `BEFORE UPDATE` / `BEFORE DELETE` → `RAISE(ABORT)` ; aucune fonction d'écriture autre qu'INSERT dans le code ; l'UI n'expose aucune action de correction | `journal-db.test.js` : `UPDATE`/`DELETE` directs refusés |
| **FISC-1** séquence continue | Trigger `journal_seq_continue` : `NEW.seq` doit valoir `MAX(seq)+1` | idem : saut de séquence refusé |
| **FISC-1** préfixe poste | `ref = POSTE-XX-000001` (6 chiffres minimum, jamais tronqué) | `journal.test.js` |
| **FISC-2** chaînage SHA-256 | `hash_self = SHA-256(hash_prev ‖ payload canonique)` ; ancre de genèse `SHA-256("GENESIS")` | `sha256.test.js` (équivalence `node:crypto`), `journal.test.js` |
| **FISC-3** aucune écriture anonyme | `user_matricule` + `user_nom` obligatoires (module **et** CHECK SQL) | `journal.test.js`, `journal-db.test.js` |
| **FISC-3** motif + second | Obligatoires pour `ANNULATION`, `REMISE`, `CHANGEMENT_PRIX` | `journal.test.js` |
| **FISC-4** horloge monotone | Horodatage jamais antérieur au précédent ; recul → incident `HORLOGE` journalisé **avant** l'écriture demandée ; même instant → +1 ms | `journal.test.js` |
| **FISC-4** écart serveur | Pull renvoie `serverTime` ; écart > 60 s → `HORLOGE` | `journal.test.js`, `fiscal-chain.js` |
| **FISC-7** détection d'altération | Vérification complète (chaîne + continuité) **au démarrage** ; rupture ⇒ service refusé, incident affiché | `App.js` (`assertChainIntact`), `journal-db.test.js` |

## 2. Schéma (migration 2)

```sql
CREATE TABLE journal (
  seq INTEGER PRIMARY KEY,          -- 1, 2, 3… sans trou (trigger)
  uuid_op TEXT NOT NULL UNIQUE,     -- idempotence du push (SYNC-1)
  ref TEXT NOT NULL UNIQUE,         -- POSTE-01-000001
  type TEXT NOT NULL CHECK (type IN (...10 types...)),
  ts_local TEXT NOT NULL,           -- ISO 8601, monotone
  user_matricule TEXT NOT NULL CHECK (… 1..16 …),
  user_nom TEXT NOT NULL CHECK (… 1..60 …),
  validator_matricule TEXT,
  motif TEXT,
  payload TEXT NOT NULL,            -- JSON canonique (clés triées, sans espace)
  hash_prev TEXT NOT NULL CHECK (64 hex),
  hash_self TEXT NOT NULL CHECK (64 hex),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Triggers : `journal_seq_continue`, `journal_no_update`, `journal_no_delete`.
Index : `type`, `ts_local`.

## 3. Payload auto-porteur

Le hash ne couvre pas que « les données métier » : le payload embarque **tout**
ce qui doit être invérifiable, y compris les métadonnées FISC-3.

```json
{
  "type": "VENTE",
  "ref": "POSTE-01-000042",
  "ts": "2026-11-18T12:34:56.000Z",
  "poste": "POSTE-01",
  "user": { "matricule": "S08", "nom": "Sarah Martin" },
  "validator": null,
  "motif": null,
  "data": { "commande": "CMD-…", "lignes": [], "total": 12.5 }
}
```

Canonicalisation **identique** au serveur (`apps/web/lib/fiscal.js`) : clés
triées, aucun espace, `JSON.stringify` pour les scalaires. C'est ce qui permet
au cloud de re-vérifier chaque écriture (SYNC-2) sans jamais la corriger.

## 4. Horloge (FISC-4)

- `guardTimestamp(dernier, maintenant)` : recul → horodatage conservé au dernier
  connu + `recul: true` ; égalité → `+1 ms`.
- `appendEntry` journalise d'abord un `HORLOGE` (motif + écart en ms), puis
  l'écriture demandée : la chronologie reste intacte, l'incident est traçable.
- `checkClockSkew(local, serverTime)` : seuil 60 s, sens (`retard`/`avance`).
  Le pull expose `serverTime` ; au-delà du seuil, `appendServerClockEvent`
  journalise l'écart (une fois par constat).

## 5. Vérification

`verifyJournal(entries)` = chaînage complet **+** continuité de séquence.
La réplique cloud, elle, vérifie par poste (`verifyChainsByPoste`) : chaque
poste a sa propre chaîne et sa propre numérotation — les mélanger produirait une
fausse rupture (défaut corrigé en M2, régression `TC-CHAIN`).

## 6. Limites assumées

- **Envoi en cuisine = VENTE de pré-encaissement (M5)** : `sendOrder` écrit une
  VENTE auto-porteuse (prix figés, quantités, TVA par taux) avec l'utilisateur
  authentifié (M3), puis gèle les lignes. L'encaissement et le ticket
  (PAIEMENT/TICKET) arrivent avec M6. Aucune écriture de démonstration n'est
  jamais insérée dans un journal fiscal.
- **Scellé Z signé** : M8 (clé asymétrique du Keystore), pas M2.
- **Pas de chiffrement de la base au repos** : SQLite en clair dans le sandbox
  applicatif Android ; le scellement fiscal repose sur le chaînage + les
  triggers. Un chiffrement SQLCipher est un candidat backlog, non implémenté.
