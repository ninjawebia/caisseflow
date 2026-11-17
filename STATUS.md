# STATUS — CaisseFlow

Stack: `F` — Hybride : backend Next.js + PostgreSQL + Prisma (Docker/Dokploy) + apps React Native (tablette caisse NF525 + terminaux de salle)
Created: 2026-11-16 00:36

## Phases

- [x] Phase 1 — PRD (`prd/PRD-v0.1.md`) — interview A1–A10 complète, PRD approuvé avec amendement module IMP (impression ticket)
- [x] Phase 2 — UI Design (`design/DESIGN-BLUEPRINT.md`) — blueprint 4 surfaces validé par l'utilisateur
- [x] Phase 3 — Code (`app/`) — 11 modules construits, testés et committés un par un
- [x] Phase 4 — Local test — 11/11 routes PASS 200 ; `qa-check.sh` 0 FAIL / 0 WARN
- [x] Phase 4.5 — Security audit (`security/REPORT.md`) — gate PASS : 20 PASS / 0 FAIL / 0 WARN ; 2 needs_validation (déploiement), 7 rejets prouvés, 0 confirmé
- [x] Phase 5 — Handoff (`HANDOFF.md` écrit, commit 401592f) — **déploiement en attente de votre autorisation séparée**

## Modules

Build one module, test it, commit it, then start the next one.
Test: `bash scripts/test-local.sh CaisseFlow --check --path <route>`
Commit: `bash scripts/git-save.sh CaisseFlow "<message>"`

| # | Module | Screen / route | Test evidence | Commit | Done |
| --- | --- | --- | --- | --- | --- |
| 1 | Fondations + Auth | `/login` + `/api/auth/login|logout` | `test-local --check --path /login` → PASS 200 ; `/` → 307 ; migrations + seed OK (22 écritures chaînées SHA-256, 2 clôtures Z, 4 comptes web, 4 matricules) | 9252c96 | [x] |
| 2 | Dashboard | `/dashboard` | `test-local --check --path /dashboard` → PASS 200 ; KPI + TVA multi-taux + barres 7 jours + dernières écritures | 675ccc5 | [x] |
| 3 | Menu & TVA | `/menu` + `/api/articles` | `test-local --check --path /menu` → PASS 200 ; CRUD articles avec validation serveur + audit | a30bdd5 | [x] |
| 4 | Utilisateurs & droits | `/utilisateurs` + `/api/users-*` | `test-local --check --path /utilisateurs` → PASS 200 ; PIN bcrypt, blocage 5 échecs, audit | c661de8 | [x] |
| 5 | Tables & salles | `/tables` + `/api/tables` | `test-local --check --path /tables` → PASS 200 ; CRUD, désactivation tracée | 4ada793 | [x] |
| 6 | Journal NF525 + Sync | `/journal` + `/api/sync/push|pull` + `/api/licence/status` | PASS 200 ; push #1 accepted:1 chainVerified:true ; push #2 (UUID identique) duplicates:1 — idempotence T-SYNC-03 ; push #3 chaînage invalide → rejected:1 chainVerified:false ; sans jeton → 401 | 7439f8b | [x] |
| 7 | Rapports de ventes | `/rapports` | PASS 200 ; login gérant OK (fix import depth + alias hashedpassword) ; total période 510,70 €, TVA par taux, par serveur (S07), top articles rendus | da8a20c | [x] |
| 8 | Exports fiscaux | `/exports` + `/api/exports[/id]` | PASS 200 ; export CSV journal (23 écritures) généré par comptable, empreinte SHA-256 **vérifiée par recalcul** ; admin_plateforme → 403 (RBAC) | ff8d947 | [x] |
| 9 | Licence | `/licence` + `/api/licence` | PASS 200 ; admin → grace2 : device `licence/status` etat:grace2, push → **403** ; gérant PATCH → 403 ; admin → active : push redevenu OK (chainVerified:true) | a3cfbc3 | [x] |
| 10 | Journal d'audit | `/audit` | PASS 200 ; filtre `action=export` → 21 événements export rendus, lecture seule | 1a8eab1 | [x] |
| 11 | Modèle de ticket | `/ticket-modele` + `/api/ticket-template` | PASS 200 ; PATCH gérant OK (logo + mentions persistés) ; comptable/admin → 403 (RBAC correct) | 1e2b952 | [x] |

## Passes de test complet

### Passe 2 — 2026-11-16 (après fix UX `69cb0b2`) : technique + fonctionnel, 4 rôles

Technique : `make check` (stop → purge `.next` → harnais) **11/11 PASS 200** · `qa-check.sh` **0 FAIL / 0 WARN** · `security-audit.sh` **20 PASS / 0 FAIL / 0 WARN**.

| Bloc | Tests | Résultat |
| --- | --- | --- |
| Auth (4 comptes web) | login gérant/comptable/auditeur/admin → 200 ; faux mot de passe → 401 ; POST sans Origin → 200 (toléré : cookie SameSite=Lax, décision documentée `lib/http.js`) ; Origin hostile `https://evil.example` → **403** ; logout → **303 /login** + session révoquée (« Session requise » ensuite) | ✅ |
| RBAC 4 rôles × 11 pages | 44/44 conforme à `lib/auth.js` : menu/utilisateurs/tables/ticket → gérant seul ; rapports/audit → tous ; journal/exports → sauf admin ; licence/dashboard → tous ; admin sans restaurant → états vides prévus (« Aucune vente », « Aucune donnée ») | ✅ |
| APIs métier | articles POST 201 + PATCH (version bump, `categorie_nom` renvoyé) + DELETE 200 ; comptable → 403 ; sans session → 403 ; ticket-template comptable → 403 ; licence PATCH admin 200 / gérant 403 ; exports POST complet 201 + GET fichier (gérant/comptable 200, admin 403, EMPREINTE SHA-256 en fin de fichier) | ✅ |
| Sync appareil | pull Bearer `device-token-demo-POSTE-01` → 200 (carte + catalogue) ; faux jeton → 401 ; sans jeton → 401 ; `licence/status` appareil → 200 (route appareil, 401 en session web = attendu) ; push re-jeu seq 1 → `duplicates:1 rejected:0 chainVerified:true`, journal 23→23 lignes (idempotent) | ✅ |
| Contenu pages | dashboard : 0 « Erreur de chargement », KPI **88,60 €** réels, CSS compilé local (`layout.css`) ; rapports : dates **16/11/2026** + Total période ; menu : chawarma + catégorie rendue ; utilisateurs/tables/journal/audit/licence/ticket-modele : marqueurs présents | ✅ |
| Données de test | « Test Complet » désactivée (tracée, jamais supprimée) ; démo inchangée (23 écritures chaînées intactes) | ✅ |

Anomalies constatées pendant la passe : les 403 initiaux venaient du script de test (en-tête Origin non étendu par guillemets simples) — re-testés et conformes.

## Notes

- Reference images: `refs/`
- Design Blueprint: `design/DESIGN-BLUEPRINT.md`
- Security artifacts: `security/`

## Refonte du socle — 100 % conteneurisé (2026-11-16)

| Élément | Détail |
| --- | --- |
| Règle | Aucun node/npm/npx sur l'hôte — tout via Docker/Compose (règle AGENTS.md skill) |
| Structure | `apps/web` (ex-`app/`, git mv), `apps/mobile` (squelette Expo + Dockerfile APK), `packages/shared` (@caisseflow/shared : types NF525 + DTO validateurs branchés dans /api/articles), `infra/` (scripts, Caddy, backups) |
| Images | web : multi-étapes deps→dev→build→runtime, Alpine non-root (node UID 1000), HEALTHCHECK `/api/health` · mobile : JDK17 + Android SDK, volume `/outputs` |
| Compose | dev : hot-reload + postgres healthy-gated + adminer + mailhog, réseau `caisseflow-net`, volumes nommés · prod : image buildée + Caddy HTTPS, `.env.prod`, 2 variantes DB |
| Data | SQL versionné conservé (décision PRD 9) ; migrations 0003/0004 : triggers RAISE EXCEPTION sur journal_replica + clotures (remplace les RULES silencieuses de 0001 — preuve observable TC-NF525-010) |
| Preuve | `docker compose down -v` (machine vierge) → up → migrate (0001…0004) → seed → `make smoke` PASS ; UPDATE/DELETE journal → `ERROR: NF525 …` ; qa 0/0 ; audit 20 PASS |
| Nettoyage hôte | ✅ appliqué (17/11) : `apps/web/node_modules`, `apps/web/.next`, cache npm, conteneur `caisseflow-db` — supprimés ; recréés dans les conteneurs |
| Backlog | 17/11 : F1 « catégories » + F2 « photos d'articles » (PRD ch. 14.1/14.2, BLUEPRINT § 9, TEST-PLAN § 21 = 19 cas NON TESTÉ, AGENT/SKILL annexe) — RBAC : gérant seul en écriture, hors journal NF525 (audit_log) |
| Nettoyage hôte | Proposé à validation : `app/node_modules` (518 M), `app/.next` (50 M), cache npm — non supprimés sans accord |

## Backlog F1 + F2 — implémentés (2026-11-17)

| Module | Contenu | Tests (dans le conteneur) | Commit |
| --- | --- | --- | --- |
| F1 CRUD catégories | migration `0005_categories_actif.sql` ; DTO `validateCategory` (@caisseflow/shared) ; GET/POST `/api/categories` + PATCH/DELETE `/api/categories/[id]` (gérant seul, audit_log, delete refusé si articles présents 400+nb_articles) ; sync pull catégories actives uniquement ; panneau UI `/menu` (créer/renommer/archiver/supprimer confirmé en 2 étapes) | **TC-BO1-CAT 13/13 PASS** | `64102ab` (poussé) |
| F2 photos d'articles | migration `0006_articles_photo.sql` (`photo_file`/`photo_hash`, pas de `photo_url` — URL dérivée) ; `lib/uploads.js` (magic bytes JPEG/PNG/WebP, ≤ 2 Mo, ≤ 2048 px, nom UUID serveur, archivage 30 j + purge) ; `/api/articles/[id]/photo` GET (ETag SHA-256 + 304, auth session **ou** Bearer device) / POST multipart / DELETE ; volume Docker `web_uploads` (chown su-exec au démarrage, stages dev + runtime) ; sync pull `photo_hash` ; UI zone photo éditeur + vignettes grille | **TC-BO1-PHOTO 12/12 PASS — TOTAL make test 25/25 PASS** + `make smoke` PASS + chaînage intact (FISC-2 ✓) | `02d1c56` (poussé) |

Correctifs pendant le cycle F2 (pièges documentés) : `params` Promise Next 15 → `(await ctx.params).id` ; volume `web_uploads` root-owned au copy-up → chown 1000:1000 via `su-exec` au démarrage ; lockfile racine régénéré (héritage bump RN 0.76.9 + expo-*) ; `detectImage` absent du `module.exports` de `lib/uploads.js` (cause du GET 500 — POST passait car `validate`/`save` étaient exportés) ; imports lib photo route en nommés.
