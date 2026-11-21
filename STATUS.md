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

## Améliorations v0.3 (2026-11-17)

| Module | Contenu | Tests | Commit |
| --- | --- | --- | --- |
| UI /menu (5 améliorations) | photo ajoutable dès la création (aperçu local + upload auto après POST) ; recherche 🔍 temps réel (accents ignorés) ; tri Article/Catégorie asc/desc ; prix saisi en HT avec TTC calculé en direct ; colonne photo stylée 48 px | TC-UI-MENU 4/4 → **TOTAL 29/29** | `95c7876` (poussé) |
| Activation de licence | migration 0007 (expires_at/plan/cle_id) ; lib/license (Ed25519, verifyKey/signLicense/licenceGate) ; POST /api/licence/activate (gérant) ; gate écritures 403 (articles/catégories/photos) + sync pull suspendu ; lecture/exports OK (LIC-4) ; UI page Licence ; `make license-keygen` / `make license-gen` (clé privée owner gitignorée, paire DEV commitée pour préprod uniquement) | TC-LIC 13/13 → **TOTAL 42/42** + smoke PASS | `bbc7b27` (poussé) |

Docs mises à jour dans la même passe : TEST-PLAN § 22 (13 cas PASS), README (Sécurité + arborescence), HANDOFF (§ 8 tests, § 10 limites : paire DEV).

## Améliorations v0.4 (2026-11-17)

| Module | Contenu | Tests | Commit |
| --- | --- | --- | --- |
| Bibliothèque média | migration `0008_media.sql` (table `media`, dédup UNIQUE(restaurant_id, hash), backfill photos F2) ; `/api/media` GET (tout le personnel, `nb_articles`) / POST (gérant + gate licence, dedup → `200 {dedup:true}`) ; `/api/media/[id]/photo` GET (ETag/304) ; `/api/media/[id]` DELETE (refus 400 si utilisé, sinon archive 30 j) ; `/api/articles/[id]/photo` POST (dédup, plus d'archivage au remplacement) + PATCH `{media_id}` (assignation bibliothèque) + DELETE (déliaison simple, asset conservé) ; `components/MediaPicker.js` (modale grille, badges « ×n »/« Active », recherche, upload depuis la modale, Échap/fond) ; zone photo 2 modes (« Téléverser une image » + « Choisir dans la bibliothèque ») | TC-MED **16/16 PASS** → TOTAL **58/58** + smoke PASS | `62a4734` (poussé) |
| Aperçu du ticket 58 mm | `components/TicketPreview.js` (ticket papier ~224 px, monospace, séparateurs pointillés, mentions NF525 en données d'exemple, bandeau « aperçu approchant ») ; intégré sous le formulaire `/ticket-modele`, mise à jour en direct pendant la saisie (logo + mentions) ; restaurant (nom/SIRET/adresse) passé par la page | TC-TKT **3/3 PASS** (inclus dans les 58) | `62a4734` (poussé) |

Docs mises à jour dans la même passe : TEST-PLAN § 23 (TC-MED) / § 24 (TC-TKT), PRD ch. 14.3/14.4 [IMPLÉMENTÉ v0.4], DESIGN-BLUEPRINT § 9.3/9.4, HANDOFF § 8 (modules 16/17).

Pièges documentés du cycle : contenus PNG des fixtures désormais **uniques par run** (`pngUnique` = PNG + sha256 du salt, sinon la dédup réutilisait l'asset d'un run précédent référencé par un article résiduel → MED-010 400) ; batteries CAT/PHOTO/MED suppriment leurs articles de test en fin de passage (rerun-safe) ; imports `licenceGate` à profondeur 3/4/5 selon la route ; doublon `export DELETE` créé par substitution partielle (balance accolades 0 vérifiée).

## Gate sécurité v0.4 (2026-11-17)

| Élément | Résultat |
| --- | --- |
| `security-audit.sh` | **20 PASS / 0 FAIL / 0 WARN** — Gate: pass |
| Confirmé corrigé | **SEC-003** (Low, 3.5) : paire DEV de licence versionnée dans l'historique git → **rotation** de la paire, désuivi (`git rm --cached` + `.gitignore`), génération idempotente `make license-devkey`, serveur de dev charge la clé publique du disque (priorité `LICENSE_PUBLIC_KEY` env > disque > constante) ; l'ancienne clé (historique) ne signe plus rien d'accepté ; régression TC-LIC 13/13 PASS |
| Rejetés documentés | REJ-009 (traversée de chemin média), REJ-010 (IDOR cross-tenant média), REJ-011 (bypass validation upload) — preuves dans `security/findings.json` |
| Décisions tracées | pas de quota par tenant sur média (plafond par fichier + dédup + gérant-only) ; REPORT § 4 |
| Tests | **58/58 PASS** + `make smoke` PASS (après fixes : warm-up batterie MED, date SQL du test LIC calculée en JS) |

Pièges documentés du cycle gate : premier `make test` après redémarrage à froid du conteneur web peut servir un 500 « Unexpected end of JSON input » (artefact HMR `next dev` uniquement) → wrapper `fetchR` (1 ré-essai sur 5xx) dans la batterie TC-MED.

## Build APK v0.4.0 (2026-11-17)

| Élément | Résultat |
| --- | --- |
| APK | `output/apk/caisseflow-0.4.0-release.apk` — `fr.caisseflow.app` **versionName 0.4.0, versionCode 2**, minSdk 24 (vérifié `aapt2 dump badging`) |
| Build | BUILD SUCCESSFUL 4 m 25 s (Gradle assembleRelease dans le conteneur mobile, `make build-apk`) |
| Infrastructure | nouveau volume nommé `android_sdk` (NDK r26b ~2,5 Go installé UNE fois, plus de re-téléchargement à chaque build) ; build-tools 34.0.0 ajouté au SDK (demandé par le template RN 0.76.9) ; image mobile rebuildée (app.json 0.4.0 + package.json 0.4.0 sont COPIÉS dans l'image — pas de montage source) |
| Pièges documentés | le nom d'APK vient de `apps/mobile/package.json` (bumpé 0.1.0 → 0.4.0 en même temps que app.json) ; l'ancienne 1ʳᵉ erreur du build (« Could not get unknown property 'release' ») est COLLATÉRALE à l'échec d'installation du NDK ; `sdkmanager ndk;26.1.10909125` manuel ≈ 15-25 min (lent mais fiable) | 
| Commit | `4835d7a` (poussé) |

## Module 19 — Enrôlement des tablettes (M0 caisse Phase 1, 2026-11-18)

| Élément | Résultat |
| --- | --- |
| Besoin | Le back-office savait créer des comptes web/mobiles mais **pas enrôler une tablette** : les jetons d'appareil n'existaient que par le seed (démo `POSTE-01`). Sans enrôlement, aucune caisse ne peut synchroniser en production (PRD 4.1.10, SYNC-1/4). |
| Livré | page `/appareils` (gérant) + `POST /api/devices` (jeton 256 bits affiché **une fois**, stocké hashé SHA-256) + `GET /api/devices` (liste, jeton jamais relisible) + `DELETE /api/devices/:id` (révocation `actif=false`, jamais de suppression) + entrée de nav « Appareils » + permission RBAC `devices` (gérant uniquement) |
| Règles | un seul jeton **actif** par poste `POSTE-01…POSTE-99` (`409` sinon, `device_id` retourné) ; révocation → `pull`/`push` répondent `401` immédiatement ; audit `device_create` / `device_revoke` ; le jeton n'est **jamais** renvoyé par la liste |
| Fichiers | `app/api/devices/route.js`, `app/api/devices/[id]/route.js`, `app/appareils/page.js`, `components/DevicesClient.js`, `components/Shell.js`, `lib/auth.js`, `tests/device-features.js` |
| Tests | **TC-DEV 33/33 PASS** (`make test`, exit 0) — total projet **91/91 PASS** (29 backlog + 13 LIC + 16 MED/TKT + 33 DEV) ; `make smoke` PASS ; cycle arrêt web → purge volume `next_cache` → up → migrate → tests respecté |
| UX | jeton affiché en encart ambre avec bouton **Copier**, avertissement « une seule fois », masquage manuel ; révocation en 2 temps (Confirmer/Annuler) ; états vide, occupé, erreur serveur ; table responsive |
| Écart PRD | aucun (périmètre PRD ch. 4.1.10 / SYNC-4) |
| Commit | `dc672c5` (poussé) |

## Module 20 — Socle mobile de la caisse (M1, 2026-11-18)

| Élément | Résultat |
| --- | --- |
| Besoin | L'APK n'était qu'un écran statique : aucun stockage local, aucune identité d'appareil, aucune preuve que l'enrôlement M0 fonctionne depuis une tablette. Sans socle, impossible d'implémenter le journal fiscal (M2). |
| Livré | base SQLite locale migrée (`expo-sqlite`, WAL, `PRAGMA user_version`) ; jeton + adresse serveur dans le Keystore (`expo-secure-store`, jamais en clair, jamais journalisés) ; écran d'enrôlement (adresse + jeton, contrôle local 43 caractères, preuve par `POST /api/sync/pull`, erreurs typées) ; écran d'accueil (poste enrôlé, licence, compteurs menu/staff/tables, contrôle de connexion, réinitialisation confirmée) ; démarrage machine à états (boot → enrôlement ou accueil, écran de reprise si échec) |
| Architecture | `src/core/*` = logique **pure** (config, jeton, versions, HTTP injectable, enrôlement, planificateur de migrations) → testable sans appareil ; `src/db`, `src/storage`, `src/screens` = adaptateurs natifs minces ; navigation volontairement minimale (2 écrans) au M1 |
| Sécurité | jeton uniquement en `Authorization: Bearer` ; masqué à l'écran (`abcd…wxyz`) ; refus d'une base écrite par une app plus récente ; aucune donnée métier envoyée à l'enrôlement (le pull est en lecture) |
| Tests | **TC-M1 34/34 PASS** (`node --test`, image `node:22-alpine`, `make test-mobile`) ; total projet **125 PASS / 0 FAIL** (91 web + 34 mobile) ; `make smoke` PASS |
| APK | `output/apk/caisseflow-0.5.0-release.apk` — `fr.caisseflow.app` **versionName 0.5.0, versionCode 3**, minSdk 24 (vérifié `aapt2 dump badging`) ; libs natives `libexpo-sqlite.so` présentes (arm64-v8a, armeabi-v7a, x86, x86_64) ; bundle contient `CREATE TABLE ... settings` et `/api/sync/pull` (preuve d'intégration) ; build 6 m 49 s |
| Outillage | nouvelle cible `make test-mobile` (aucun `node`/`npm` sur l'hôte), chaînée dans `make test` ; `npm test` mobile ajouté au `package.json` |
| Écart PRD | aucun (périmètre PRD ch. 4.1.10 / SYNC-4) — la pile d'écrans POS arrive avec M5 |
| Commit | `df29261` (poussé) |

## Module 21 — Journal fiscal local (M2, 2026-11-18)

| Élément | Résultat |
| --- | --- |
| Besoin | Cœur NF525 : sans journal local inaltérable, la caisse n'est pas une caisse (FISC-1..4, FISC-7). M1 fournissait la base et l'identité, aucune écriture fiscale. |
| Livré | migration 2 (table `journal` append-only + triggers `journal_seq_continue`, `journal_no_update`, `journal_no_delete` + CHECK type/hash/anonymat) ; SHA-256 **JS pur** (Hermes n'a pas `crypto`) ; `canonical`/`nextHash`/`verifyChain` au contrat exact du serveur ; `buildEntry` (payload auto-porteur, motif + second obligatoires pour annulation/remise/changement de prix) ; `entryRef` `POSTE-XX-000001` ; garde d'horloge monotone + incident `HORLOGE` ; contrôle d'écart serveur (seuil 60 s, `serverTime` ajouté au pull) ; `appendEntry` / `readJournalStatus` / `assertChainIntact` ; **vérification de chaînage au démarrage** (rupture ⇒ service refusé, FISC-7) ; carte « Journal fiscal local » sur l'accueil |
| Correctif associé (web) | `verifyChain` partait de `"GENESIS"` au lieu de `SHA-256("GENESIS")` → **fausse rupture affichée sur `/journal`** ; et plusieurs postes étaient chaînés ensemble → nouvelle fonction `verifyChainsByPoste`, page `/journal` corrigée (rupture localisée par poste), régression `TC-CHAIN` 15/15 |
| Tests | mobile **60/60 PASS** dont 8 tests sur une **vraie base SQLite** (`node:sqlite`) prouvant que `UPDATE`/`DELETE` sont refusés par les triggers, que la séquence ne saute pas et que la relecture détecte une base forgée ; web **106/106 PASS** (ajout TC-CHAIN 15) ; total **166 PASS / 0 FAIL** ; `make smoke` PASS |
| APK | `output/apk/caisseflow-0.6.0-release.apk` — **versionName 0.6.0, versionCode 4** (`aapt2`), libs `libexpo-sqlite`/`libexpo-crypto` présentes, bundle contenant `journal_no_delete` et `Journal Permanent : DELETE interdit` ; build 6 m 44 s |
| Décision tracée | SQLite via **expo-sqlite** (et non WatermelonDB, mentionné en hypothèse PRD 5/6.2) : accès SQL direct nécessaire pour les triggers append-only, le chaînage et la vérification complète, sans couche de synchronisation tierce (la file idempotente est celle de SYNC-1, implémentée en M7). Décision technique laissée à l'agent par le PRD. |
| Limites assumées | aucune écriture métier branchée (M5/M6 avec utilisateur authentifié M3) ; scellé Z signé en M8 ; pas de chiffrement au repos (candidat backlog) |
| Doc | `docs/JOURNAL-FISCAL.md` (garanties, schéma, payload, horloge, preuves) |
| Commit | `dd7ffaa` (poussé) |

## Module 22 — Authentification locale PIN (M3, 2026-11-18)

| Élément | Résultat |
| --- | --- |
| Besoin | Aucune écriture métier ne peut être produite sans savoir QUI opère (FISC-3). M2 livrait le moteur du journal, mais la caisse n'avait ni connexion opérateur, ni cache du personnel, ni verrouillage de session. |
| Livré | migration 3 (`staff` cache du personnel, `auth_state` compteur/verrouillage, `auth_events` journal local des connexions **séparé du journal fiscal**) ; `authenticate` (bcrypt local, hash factice anti-énumération, même coût pour un matricule inconnu) ; `saveStaff` (dernière version gagnante, désactivation des absents **jamais** de suppression) ; politique `auth.js` (PIN 4–6, 5 échecs → 5 min, session 3 min, arrière-plan 30 s) ; écran `LoginScreen` (chips du personnel, pavé numérique tactile, compte à rebours de blocage, état vide avec synchronisation) ; `HomeScreen` (opérateur courant + bouton **Verrouiller**) ; `App.js` (db en référence, phases boot → enroll → login → home, verrouillage inactivité/arrière-plan, journalisation `manual_lock`/`auto_lock`) |
| Refactor | `src/db/journal.js` n'importe plus `expo-crypto` : l'identifiant d'opération est **injecté** (`uuidOp`), ce qui rend l'adaptateur testable sous Node ; les adaptateurs `db/journal.js` et `db/auth.js` sont en CommonJS pour être exécutés par `node --test` sans appareil |
| Bug corrigé | `normalizeStaffRows` traitait `actif: 0` comme actif (seul `false` désactivait) → une ligne désactivée par le serveur serait restée utilisable. Détecté par TC-M3-STAFF-05, corrigé dans le code. |
| Sécurité | PIN jamais transmis ni journalisé ; réponse identique (et coût bcrypt identique) pour un matricule inconnu ; vérification refusée pendant le blocage ; hash factice `$2b$10$…` ; aucune écriture fiscale de démonstration |
| Build | bcryptjs (UMD) importe `crypto` de Node, absent de React Native **et** ignoré par le champ `browser` du paquet → `metro.config.js` mappe `crypto` vers un substitut local (`src/shims/crypto.js`) qui échoue explicitement si une génération de sel était tentée (la tablette ne fait que vérifier) |
| Tests | mobile **91/91 PASS** (dont 13 sur une vraie base SQLite via `node:sqlite` pour M3) ; web **106/106 PASS** ; total **197 PASS / 0 FAIL** ; `make smoke` PASS |
| APK | `output/apk/caisseflow-0.7.0-release.apk` — **versionName 0.7.0, versionCode 5** (`aapt2`), `libexpo-sqlite`/`libexpo-crypto`/`libexpo-secure-store` présents, bundle contenant `auth_events`, `staff_sync`, `Verrouiller`, `key-submit` et bcryptjs ; build 9 m 30 s |
| Outillage | `make test-mobile` s'exécute désormais dans **l'image mobile** (bcryptjs installé) avec `src`, `tests` et `App.js` montés en lecture seule — toujours aucun `node`/`npm` sur l'hôte |
| Écart PRD | aucun (PRD 4.1.1). La biométrie, le changement de PIN à bord et le QR d'enrôlement restent hors périmètre approuvé (candidats backlog, non implémentés) |
| Commit | `a384984` (poussé) |

## Module 23 — Données de référence locales (M4, 2026-11-19)

| Élément | Résultat |
| --- | --- |
| Besoin | La caisse doit afficher la carte (catégories, articles, TVA) et connaître ses tables **sans réseau** (PRD 4.2, SYNC-3/SYNC-5). M3 savait qui opère ; M4 fournit sur quoi opérer. |
| Livré | migration 4 (`categories`, `articles`, `tables_resto`, index catégorie) ; `core/money.js` (centimes entiers, plafond 10 000 €, format français sans `Intl`, somme de lignes) ; `core/reference.js` (validation stricte des lignes du pull, `groupMenu`, `formatSyncDate`) ; `db/settings.js` (réglages CJS) ; `db/reference-sql.js` (UPSERT + désactivations) ; `db/reference.js` (`saveReference` transactionnel, compteurs, menu, tables, `last.pull.at`, licence en cache) ; `App.js` (`syncNow` delta, sync silencieux au démarrage, état de carte, persistance de la carte dès l'enrôlement) ; `HomeScreen` (« Carte locale » : compteurs, dernière synchro, bouton Synchroniser, état vide et erreur ; licence lue dans le cache) |
| Contrat de synchronisation | Articles en **delta** (`since` = heure SERVEUR du dernier pull réussi) : un article absent du lot n'est **jamais** désactivé, une désactivation est transmise explicitement (`actif: false`). Catégories, tables et personnel en pull **complet** : un absent est désactivé localement, jamais supprimé (une commande peut y faire référence). Toute la carte est écrite dans **une transaction**. |
| Montants | Prix stockés en **centimes entiers** (`prix_ttc_cents`, CHECK entier 0..1 000 000) : aucun flottant dans les totaux futurs (ticket, ventilation TVA). Un prix absent est refusé — il ne devient jamais gratuit. |
| Défense en profondeur | Les lignes reçues sont validées AVANT écriture (UUID, nom, prix, TVA à une décimale, places 1..20, version numérique) ; une ligne douteuse est rejetée et comptée, les autres passent. `actif` des catégories est désormais transmis par le pull web (les catégories archivées restent absentes du lot → désactivation locale). |
| Sécurité | Aucune donnée sensible dans la carte ; la licence affichée vient du cache local (lisible hors ligne) ; le pull reste protégé par le jeton d'appareil et le gate licence (403). |
| Tests | mobile **116/116 PASS** (dont 9 sur une vraie base SQLite pour M4) ; web **106/106 PASS** ; total **222 PASS / 0 FAIL** ; `make smoke` PASS ; contrôle de syntaxe Babel 28 fichiers |
| APK | `output/apk/caisseflow-0.8.0-release.apk` — **versionName 0.8.0, versionCode 6** (`aapt2`), `libexpo-sqlite`/`libexpo-crypto`/`libexpo-secure-store` présents, bundle contenant `Carte locale`, `prix_ttc_cents`, `tables_resto`, `Synchroniser` et le SQL de désactivation ; ancien APK 0.7.0 retiré |
| Écart PRD | aucun (PRD 4.2). Photos d'articles (`photo_hash` stocké, image non téléchargée), variantes/suppléments et gestion des salles côté caisse restent hors périmètre approuvé (candidats backlog, non implémentés) |
| Commit | `e7fe576` (poussé) |

## Correctif 0.8.1 — HTTP en clair refusé par Android (2026-11-19)

| Élément | Résultat |
| --- | --- |
| Symptôme | Enrôlement impossible sur tablette : adresse `http://192.168.1.129:3000` acceptée mais « Serveur injoignable », alors que `/api/health` répond 200 depuis le réseau. |
| Cause | `targetSdk 34` : Android bloque le HTTP en clair en build **release** (`usesCleartextTraffic` absent du manifeste généré par Expo). |
| Correctif | `apps/mobile/plugins/withCleartextTraffic.js` (plugin Expo `withAndroidManifest`) déclaré dans `app.json` → `android:usesCleartextTraffic="true"` à chaque prebuild. Aucun fichier natif maintenu à la main. |
| Portée | Back-office local du restaurant (HTTP sur LAN). En exposition Internet : HTTPS obligatoire et plugin à retirer. |
| Vérification | Manifeste APK 0.8.1 : `usesCleartextTraffic=true` ; tests mobile **116/116**, web **106/106** sur **deux passages consécutifs** ; `make smoke` PASS. |
| APK | `output/apk/caisseflow-0.8.1-release.apk` (versionCode 7, seul APK conservé). |
| Tests rendus rerun-safe | Les batteries web dépendaient du jeton démo `device-token-demo-POSTE-01`, que le gérant révoque légitimement en créant le jeton d'une vraie tablette (3 échecs constatés). `backlog-features` (POSTE-78) et `licence-features` (POSTE-79) créent désormais leur **propre jeton dédié** avant les assertions et le révoquent en fin de passage ; deux passages consécutifs sont verts et le jeton réel de la tablette reste actif. |

## Module 24 — Prise de commande (M5, 2026-11-19)

| Élément | Résultat |
| --- | --- |
| Besoin | La caisse doit prendre une commande **hors ligne** (tables + comptoir), l'envoyer en cuisine et l'écrire au journal (PRD POS-1/2/3). M4 fournissait la carte locale, aucun écran de saisie. |
| Livré | migration 5 (`commandes`, `commande_lignes`, index unique partiel `idx_commandes_table_active` : **une** commande active par table) ; `core/orders.js` (quantités 1..99, validation d'article, fusion des lignes non envoyées, prix figé, `orderTotals` avec TVA extraite du TTC par ligne, `buildSalePayload` auto-porteur) ; `db/orders-sql.js` et `db/orders.js` (`createOrder`, `getOrder`, `listOpenOrders`, `openOrdersByTable`, `addArticle`, `setLineQty`, `removeLine`, `sendOrder` transactionnel) ; `TablesScreen` (plan de salle par salle, occupation + total, comptoir) ; `OrderScreen` (catégories, articles, panier ±, totaux TTC/TVA, envoi en cuisine) ; accueil (« Prendre une commande ») ; navigation `home | tables | order` avec verrouillage inactivité/arrière-plan conservé ; pull web enrichi de `poste` et persistance `device.poste` |
| Envoi en cuisine | Une **VENTE** de pré-encaissement (POS-3) : payload auto-porteur contenant lignes envoyées, prix figés, total d'envoi, total commande et TVA par taux. Les lignes passent `envoyee = 1` (plus modifiables) et la commande `ENVOYEE` avec `journal_ref` (`POSTE-01-000001`). La table reste occupée jusqu'à l'encaissement (M6). |
| Complément | Un ajout après envoi ne modifie jamais une ligne envoyée : il crée une ligne non envoyée, et l'envoi suivant écrit une 2ᵉ VENTE `complement: true`. |
| Atomicité | Journal, lignes et commande dans **une seule transaction** : un envoi refusé laisse la commande `OUVERTE`, les lignes non envoyées et **aucune** vente au journal (prouvé par TC-M5-DB-07). |
| Défense en profondeur | L'unicité de la commande active est garantie par **SQLite** (index partiel), pas seulement par l'écran ; un doublon est refusé même en SQL direct. Totaux en centimes entiers, aucune arithmétique flottante. |
| Tests | mobile **135/135 PASS** (dont 19 nouveaux : 12 logique pure + 7 sur vraie base SQLite) ; web **107/107 PASS** (nouveau TC-M5-SYNC-001 sur `poste`) ; total **242 PASS / 0 FAIL** ; `make smoke` PASS |
| APK | `output/apk/caisseflow-0.9.0-release.apk` — **versionName 0.9.0, versionCode 8** (`aapt2`), `usesCleartextTraffic=true` (HTTP LAN), bundle contenant `Prise de commande`, `Envoyer en cuisine`, `idx_commandes_table_active` et le garde-fou de poste (UTF-16 Hermes). Ancien APK 0.8.1 retiré. |
| Écart PRD | aucun (PRD 4.1.2 / POS-1..3). Transfert de table, annulation de ligne envoyée avec motif + second, KDS et encaissement restent aux modules suivants (M6–M9). |
| Commit | `50ddcf0` (poussé) |

## Correctif — téléchargement des exports fiscaux (2026-11-21)

| Élément | Résultat |
| --- | --- |
| Symptôme | Compte comptable, téléchargement d'un export journal : `410 {"error":"Fichier d'export indisponible"}` alors que le fichier existait sur l'hôte. |
| Cause | Deux chemins divergents : `POST /api/exports` écrivait dans `output/exports` (bind-mount hôte), `GET /api/exports/[id]` lisait `apps/web/var/exports`. |
| Correctif | `apps/web/lib/exports.js` = source unique (`EXPORT_DIR` surchargeable) utilisée par la génération ET le téléchargement ; résolution par basename dans ce répertoire (pas de traversée). Un identifiant UUID mal formé renvoie **404** au lieu d'un 500 PostgreSQL. |
| Régression | nouvelle batterie `TC-EXP` 10/10 PASS (génération, HTTP 200, MIME, disposition, empreinte SHA-256 recalculée, droits auditeur/admin, 404 inconnu et UUID invalide). Rerun-safe : fichier + ligne de test supprimés, `audit_log` conservé. |
| Vérification | web **117/117 PASS**, mobile **135/135 PASS**, total **252 PASS / 0 FAIL** ; contrôle manuel de l'export signalé (`95c0d4fc-…`) : HTTP 200, 6 771 octets, empreinte présente. |
| Commit | `f1e30f4` (poussé) |
