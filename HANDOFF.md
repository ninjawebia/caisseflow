# HANDOFF — CaisseFlow (POS NF525)

Date : 2026-11-16
Version : 0.1.0 (pilote)
Dossier : `projects/pos-nf525/`

## 1. URL

| Environnement | URL | État |
| --- | --- | --- |
| Local (testé) | `http://localhost:4173` via `bash scripts/test-local.sh pos-nf525` | opérationnel, 11/11 routes PASS |
| Production | **non déployée — déploiement soumis à votre autorisation séparée** | — |

## 2. Comptes (démonstration locale — à désactiver en production)

| Rôle | Identifiant | Mot de passe | Droits |
| --- | --- | --- | --- |
| Gérant | `gerant@local.test` | `Gerant123!` | tout, hors gestion de licence |
| Expert-comptable | `comptable@local.test` | `Compta123!` | rapports, journal, exports, audit |
| Auditeur fiscal | `auditeur@local.test` | `Audit123!` | idem comptable |
| Admin plateforme | `admin@local.test` | `Admin123!` | licence + audit (pas de données fiscales) |

Matricules mobiles (PIN) : `MGR` 1234 · `SEC` 2345 · `S07` 3456 · `K01` 4567.
Jeton d'appareil de démonstration : `device-token-demo-POSTE-01` (voir NV-1 :
**ne jamais exécuter `db/seed.js` en production** ; générer des jetons
`crypto.randomBytes(32).toString("hex")` et les mots de passe réels).

## 3. Stack technique

| Couche | Technologie |
| --- | --- |
| Frontend back-office | Next.js 15.5.29 (App Router, React 19, Tailwind CDN — bundle local + CSP recommandé en prod) |
| Backend | Routes API Next.js (Node runtime) |
| Base de données | PostgreSQL 16 (Docker local, port 5433 ; Dokploy/VPS en prod) |
| Fiscal | chaînage SHA-256 canonique (`lib/fiscal.js`), règles SQL append-only |
| Auth | sessions opaques hashées 24 h, bcrypt(10), TOTP RFC 6238, verrouillage 5 échecs/15 min |
| Mobile (livrable documenté, hors périmètre local) | React Native — tablette caisse POSTE-01, terminaux de salle (paiement techniquement désactivé), KDS cuisine |

## 4. Variables d'environnement (noms uniquement)

| Nom | Où | Note |
| --- | --- | --- |
| `DATABASE_URL` | `.env` racine du projet (gitignore) | connexion PostgreSQL |
| `SESSION_COOKIE_NAME` | `.env` (réservé, valeur par défaut `cf_session`) | nom du cookie de session |

Aucune valeur secrète dans ce document, le dépôt ou les logs.

## 5. Exécution locale

Via le **Makefile** (recommandé) :

```bash
cd projects/pos-nf525
make install      # dépendances (première fois)
make migrate      # PostgreSQL Docker + migrations idempotentes
make seed         # données de démonstration (JAMAIS en production)
make dev          # serveur → http://localhost:3000
make check        # vérifie les 11 routes (PASS 200 attendu)
make reset        # base de démo neuve (volume supprimé + migrate + seed)
```

Équivalent manuel :

```bash
cd projects/pos-nf525/app
docker compose up -d db          # PostgreSQL 16 (port 5433)
npm install
npm run db:migrate               # migrations idempotentes (ledger schema_migrations)
npm run db:seed                  # DÉMO UNIQUEMENT — jamais en production
cd ../.. && bash scripts/test-local.sh pos-nf525 --check --path /login --path /dashboard
```

## 6. Redéploiement (stack G — Next.js + PostgreSQL)

Vercel : importer le dépôt, définir `DATABASE_URL` (Postgres managé), build
`next build`. VPS/Dokploy : image Docker `next build` + `next start`,
PostgreSQL managé, migrations via `npm run db:migrate` au démarrage.
Voir `workflow/05-handoff.md` §3 pour les alternatives.

## 7. Sauvegarde & rollback

| Élément | Sauvegarde | Rollback |
| --- | --- | --- |
| Données | `pg_dump` quotidien (exigence 6 ans pour les données fiscales — PG 13.4) | restauration du dump sur instance neuve |
| Code | historique git local (`projects/pos-nf525/.git`, un commit par module) | redeploy du commit précédent |
| Déploiement | historique Vercel/image Docker | promotion de l'ancienne version |

## 8. Tests par module (preuves réelles, voir STATUS.md pour le détail)

| # | Module | Commit | Preuve clé |
| --- | --- | --- | --- |
| 1 | Fondations + Auth | `9252c96` | `/login` PASS ; seed : 22 écritures chaînées, 2 Z |
| 2 | Dashboard | `675ccc5` | PASS 200, KPI/TVA/barres |
| 3 | Menu & TVA | `a30bdd5` | PASS 200, CRUD + audit |
| 4 | Utilisateurs & droits | `c661de8` | PASS 200, PIN bcrypt |
| 5 | Tables & salles | `4ada793` | PASS 200 |
| 6 | Journal + Sync | `7439f8b` | idempotence UUID (duplicates:1), rejet chaînage invalide, 401 sans jeton |
| 7 | Rapports | `da8a20c` | PASS 200, total 510,70 €, par serveur/article |
| 8 | Exports signés | `ff8d947` | empreinte SHA-256 **vérifiée par recalcul** ; RBAC 403 admin |
| 9 | Licence | `a3cfbc3` | grace2 → push 403 ; retour active → push OK ; gérant 403 |
| 10 | Audit | `1a8eab1` | PASS 200, filtres |
| 11 | Modèle de ticket | `1e2b952` | PATCH gérant OK ; comptable/admin 403 |
| — | QA + fixes | `86b87c6` | qa-check 0 FAIL / 0 WARN |
| — | Gate sécurité | `3df586e` | `security-audit.sh` exit 0 (20 PASS / 0 FAIL / 0 WARN) |

## 9. Résumé sécurité (Phase 4.5 — `security/`)

- **0 vulnérabilité confirmée ouverte.** 7 candidats rejetés avec preuves
  (`findings.json` : injection SQL, IDOR cross-tenant, CSRF, brute force,
  révocation, altération fiscale, traversée de chemin).
- **Contrôles positifs démontrés** : append-only en base (UPDATE/DELETE → 0
  ligne), isolation tenant, verrouillage, révocation de session, empreinte
  d'export vérifiable.
- **2 leads `needs_validation`** (faits de déploiement uniquement) :
  NV-1 — s'assurer que le seed de démonstration ne tourne jamais en prod et
  remplacer le jeton d'appareil de démo ; NV-2 — TLS/HSTS + cookie `Secure` à
  constater après déploiement (vérifications non destructives listées).
- Décisions de durcissement acceptées et tracées dans `security/REPORT.md` §4
  (limiteur mémoire mono-instance, quota sync/exports, CDN Tailwind → bundle
  local + CSP avant prod, TOTP à activer pour les profils sensibles).

## 10. Limites connues

- Les **apps React Native** (tablette caisse, terminaux, KDS) sont spécifiées
  dans le PRD (chapitres 7, 11, amendement IMP) mais non exécutables dans cet
  environnement : leur contrat serveur (`/api/sync/push|pull`,
  `/api/licence/status`, authentification par matricule + PIN hashé) est
  implémenté et testé côté cloud ; le client RN reste à développer.
- L'impression ESC/POS (Bluetooth/USB/TCP 9100, mDNS) est un module client
  tablette — non testable ici (PRD IMP-1..6 ; l'écriture fiscale ne dépend
  jamais de l'impression).
- Rétention 6 ans : prévoir la politique de sauvegarde PostgreSQL PG 13.4 au
  déploiement (schéma append-only déjà en place).
- Le limiteur de débit applicatif est en mémoire : sous multi-instances, ajouter
  un limiteur partagé (le verrouillage DB par compte reste actif).

## 11. Références

- PRD : `projects/pos-nf525/prd/PRD-v0.1.md` (contrat fonctionnel, 17 chapitres)
- Design : `projects/pos-nf525/design/DESIGN-BLUEPRINT.md` (+ `refs/`)
- Sécurité : `projects/pos-nf525/security/` (THREAT-MODEL, REPORT, findings.json, evidence/)
- Statut détaillé : `projects/pos-nf525/STATUS.md`
