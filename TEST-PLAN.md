# TEST-PLAN — CaisseFlow (v1.0 — 2026-11-16)

Plan de test complet, packageagé pour exécution autonome (voir `AGENT.md`, `CYCLE-DE-TEST.md`, `SKILL.md`).

> **Note de périmètre livré** : le livrable actuel est le **back-office web** (Next.js, modules BO/FISC-cloud/SYNC-cloud/LIC-cloud). Les applications React Native (tablette caisse, terminaux de salle, KDS, impression) sont des **livrables documentés non encore implémentés** — leurs cas de test existent dans ce plan et restent `NON TESTÉ` jusqu'à leur développement. Les cas marqués `Surface: BO` sont exécutables dès maintenant sur la préprod.

---

## 1. Périmètre

### 1.1 Les 9 modules

| Module | Nom | Exigences PRD | Cas de test |
| --- | --- | --- | --- |
| **FISC** | Journal permanent & conformité NF525 | FISC-1…8 | Bloc NF525 (bloquant) + bloc FISC |
| **POS** | Caisse & encaissement | POS-1…9 | Bloc POS |
| **SYNC** | Synchronisation offline-first | SYNC-1…7 | Bloc NF525/OFFLINE (bloquants) + bloc SYNC |
| **TERM** | Terminaux de prise de commande | TERM-1…5 | Bloc TERM |
| **KDS** | Écran cuisine | KDS-1…4 | Bloc KDS |
| **BO** | Back-office web | BO-1…8 | Bloc BO |
| **LIC** | Licence & dégradation progressive | LIC-1…5 | Bloc LIC |
| **SEC** | Sécurité, kiosque & exploitation mobile | SEC-1…5 | Bloc SEC |
| **IMP** | Impression ticket ESC/POS | IMP-1…7 | Bloc IMP |

### 1.2 Les 4 surfaces

| Surface | Rôle | État du livrable |
| --- | --- | --- |
| **Tablette caisse** (Android, RN) | Encaissement, journal local, clôture Z | Livrable documenté — tests planifiés |
| **Terminaux de salle** (Android, RN) | Prise de commande, paiement désactivé | Livrable documenté — tests planifiés |
| **KDS** (écran cuisine) | Affichage tickets, actions préparation | Livrable documenté — tests planifiés |
| **Back-office web** (Next.js) | Menu, utilisateurs, tables, rapports, journal, exports, licence, audit | **Implémenté et testé** |

---

## 2. Conventions

### 2.1 Schéma d'identification

- `TC-<MODULE>-<NNN>` : cas fonctionnel par module (ex. `TC-POS-004`).
- `TC-NF525-<NNN>` : cas **bloquants conformité NF525** (section 4).
- `TC-OFF-<NNN>` : cas **bloquants offline-first** (section 5).
- `TC-REG-<NNN>` : non-régression sur bugs signalés puis corrigés (section 13).
- `TC-PERF-` / `TC-COMPAT-` / `TC-UX-` / `TC-PART-` : performance, compatibilité, utilisabilité, recette participative.

### 2.2 Champs de chaque cas de test

Chaque cas porte : **ID**, **titre**, **module**, **exigence PRD liée**, **priorité** (Critique / Haute / Moyenne / Basse), **type** (taxonomie ci-dessous), **préconditions**, **étapes numérotées**, **résultat attendu (précis et vérifiable)**, **résultat observé** (colonne vide à remplir), **statut** (PASS / FAIL / BLOQUÉ / NON TESTÉ), **bug lié** (ID ticket, si applicable).

### 2.3 Taxonomie des types

| Type | Définition |
| --- | --- |
| **fonctionnel** | Le comportement métier attendu (encaisser, annuler, exporter…) |
| **interface** | Apparence, mise en page, libellés, états visuels (chargement, vide, erreur), responsive 360–1920 px |
| **base de données** | Persistance, contraintes, chaînage, migrations, idempotence |
| **compatibilité** | Navigateurs, versions Android, résolutions, imprimantes |
| **performance** | p95 API, latence LAN, taille de journal, temps de démarrage |
| **sécurité** | Auth, RBAC, CSRF, secrets, non-fuite de données, kiosque |
| **utilisabilité** | Parcours sans aide, lisibilité, clarté des messages |
| **participatif** | Recette terrain avec de vrais utilisateurs (pilote restaurant) |

### 2.4 Statuts

`PASS` · `FAIL` · `BLOQUÉ` (prérequis absent, ex. tablette non disponible) · `NON TESTÉ` (défaut).

**Règle d'or** : jamais de `PASS` sans vérification effective du résultat attendu (règle AGENT.md n° 1).

### 2.5 Environnement de référence (préprod)

- Back-office : `http://localhost:3000` (dev) ou hôte préprod ; harnais `make check` = stop → purge `.next` → tests 11 routes PASS 200.
- Données de démo déterministes : comptes web `gerant@local.test/Gerant123!`, `comptable@local.test/Compta123!`, `auditeur@local.test/Audit123!`, `admin@local.test/Admin123!` ; matricules PIN `MGR 1234`, `SEC 2345`, `S07 3456`, `K01 4567` ; jeton appareil `device-token-demo-POSTE-01` (POSTE-01).
- Base : PostgreSQL Docker `caisseflow-db` (port 5433) ; journal seed = 23 écritures chaînées SHA-256 + 2 clôtures Z.
- `make seed` / `db/seed.js` : **jamais** sur une environnement de production (lead NV-1).

---

## 3. Matrice de traçabilité exigences PRD → cas de test

| Exigence | Résumé | Cas de test |
| --- | --- | --- |
| FISC-1 | Journal append-only local, seq continu, pas d'UPDATE/DELETE | TC-NF525-001, TC-NF525-002, TC-NF525-003, TC-FISC-001 |
| FISC-2 | Chaînage SHA-256 par écriture, contrôle complet | TC-NF525-004, TC-NF525-005, TC-SYNC-006 |
| FISC-3 | Auteur + horodatage + motif + validateur sur chaque écriture | TC-FISC-002, TC-POS-011, TC-POS-012 |
| FISC-4 | Contrôle d'horloge, monotonic guard | TC-NF525-006, TC-FISC-003 |
| FISC-5 | Clôture Z scellée, une par jour/poste | TC-NF525-007, TC-NF525-008, TC-FISC-004 |
| FISC-6 | Clôture mensuelle cloud signée | TC-FISC-005 |
| FISC-7 | Détection d'altération au démarrage, refus de service | TC-NF525-009, TC-FISC-006 |
| FISC-8 | Réplique cloud append-only, conservation 6 ans | TC-NF525-010, TC-FISC-007, TC-FISC-008 |
| POS-1 | Salle : ouvrir, transférer, fusionner (journalisé) | TC-POS-001, TC-POS-002 |
| POS-2 | Saisie articles, prix figés à l'ajout, variantes | TC-POS-003, TC-POS-004 |
| POS-3 | Envoi cuisine, ticket complémentaire | TC-POS-005 |
| POS-4 | Encaissement TPE/espèces/mixte, caisse seule | TC-POS-006, TC-POS-007, TC-TERM-006 |
| POS-5 | Ticket conforme ESC/POS, réimpression journalisée | TC-IMP-005, TC-IMP-006, TC-NF525-011 |
| POS-6 | Annulation : motif + PIN + validation second, nouvelle écriture | TC-NF525-012, TC-POS-008 |
| POS-7 | Remise / changement de prix plafonnés | TC-POS-009, TC-POS-010 |
| POS-8 | Comptoir / à emporter | TC-POS-013 |
| POS-9 | Clôture de service depuis l'écran caisse | TC-FISC-004 |
| SYNC-1 | File idempotente, UUID appareil, déduplication | TC-OFF-005, TC-SYNC-001 |
| SYNC-2 | Push ordonné par seq, re-vérification chaînage, rejet lot rompu | TC-NF525-013, TC-SYNC-002 |
| SYNC-3 | Pull référence (menu, users, tables), delta updated_at | TC-SYNC-003, TC-SYNC-004 |
| SYNC-4 | 3 jours hors ligne, numérotation continue, 2 postes sans collision | TC-OFF-002, TC-OFF-004, TC-OFF-008 |
| SYNC-5 | Reprise après crash, WAL, aucune perte | TC-OFF-003 |
| SYNC-6 | Jeton licence vérifié à chaque sync | TC-LIC-006, TC-OFF-009 |
| SYNC-7 | Backoff + file persistante, ordre préservé | TC-OFF-006, TC-SYNC-005 |
| TERM-1 | Login matricule+PIN local, PIN jamais en clair | TC-TERM-001, TC-SEC-003 |
| TERM-2 | Commande envoyée en LAN, UUID terminal, idempotence | TC-TERM-002, TC-TERM-003 |
| TERM-3 | Paiement techniquement désactivé sur terminal | TC-TERM-006 (build + runtime) |
| TERM-4 | Suivi état commande (envoyée/préparation/servie) | TC-TERM-004 |
| TERM-5 | Découverte mDNS + provisioning < 10 min | TC-TERM-005, TC-SEC-004 |
| KDS-1 | Colonnes nouveau/en cours/prêt, temps d'attente | TC-KDS-001 |
| KDS-2 | Démarrer, prêt, rupture propagés | TC-KDS-002, TC-KDS-003 |
| KDS-3 | Jamais de prix ni de données financières | TC-KDS-004 |
| KDS-4 | Login PIN, verrouillage inactivité | TC-KDS-005, TC-KDS-006 |
| BO-1 | Menu CRUD, versionnement prix, propagation push | TC-BO-001, TC-BO-002 |
| BO-2 | Utilisateurs & droits, PIN, plafonds, désactivation | TC-BO-003, TC-BO-004 |
| BO-3 | Tables & salles | TC-BO-005 |
| BO-4 | Rapports multi-dimensions depuis réplique | TC-BO-006, TC-BO-007 |
| BO-5 | Exports signés, journalisation export | TC-NF525-014, TC-BO-008, TC-BO-009 |
| BO-6 | Journal répliqué lecture seule | TC-BO-010 |
| BO-7 | Gestion licence | TC-LIC-001…TC-LIC-005 |
| BO-8 | Audit logs append-only | TC-BO-011, TC-BO-012 |
| LIC-1 | Jeton signé, vérifié à chaque sync, cache | TC-LIC-006 |
| LIC-2 | Phase 1 : rappels non bloquants | TC-LIC-002 |
| LIC-3 | Phase 2 : cloud suspendu, caisse locale OK | TC-LIC-003, TC-OFF-009 |
| LIC-4 | Phase 3 : blocage lancement, données exportables | TC-LIC-004, TC-LIC-005 |
| LIC-5 | Garde-fous : rétablissement immédiat, numérotation continue | TC-LIC-005, TC-OFF-004 |
| SEC-1 | Mode kiosque, sortie impossible sans code admin | TC-SEC-001 |
| SEC-2 | Mise à jour forcée, version minimale | TC-SEC-002 |
| SEC-3 | Stockage chiffré, PIN hashé, pas de secret client | TC-SEC-003, TC-SEC-004 |
| SEC-4 | Installation < 10 min documentée | TC-SEC-005 |
| SEC-5 | Sessions verrouillées inactivité/fermeture | TC-SEC-006 |
| IMP-1 | Modes BT / USB OTG / TCP 9100 / mDNS | TC-IMP-001 |
| IMP-2 | Config par poste, test d'impression | TC-IMP-002 |
| IMP-3 | File persistante, impression ne conditionne jamais l'écriture | TC-IMP-003, TC-NF525-015 |
| IMP-4 | Statuts d'impression journalisés et répliqués | TC-IMP-004 |
| IMP-5 | Mentions légales, numérotation continue, empreinte courte | TC-NF525-011, TC-IMP-005 |
| IMP-6 | Double ticket, deux files indépendantes | TC-IMP-006 |
| IMP-7 | Rendu ≠ source de vérité | TC-IMP-007 |

---

## 4. ⛔ Cas de test NF525 non négociables (BLOQUANTS mise en production)

> **Si l'un de ces tests échoue, l'application est déclarée NON CONFORME NF525 : NO-GO immédiat, aucune mise en production, aucun déploiement client.** Statut de défaut requis sur chacun. Préconditions communes : préprod avec données seed intactes (23 écritures chaînées), aucun test ne doit jamais modifier/supprimer une écriture existante.

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-NF525-001 | Journal local strictement append-only | FISC-1 | Critique | base de données | Tablette caisse avec 1 vente enregistrée | 1) Ouvrir la base SQLite locale 2) Tenter manuellement `UPDATE`/`DELETE` sur `journal` 3) Redémarrer l'app et revérifier | Toute UPDATE/DELETE est impossible (triggers refusent, erreurs observées) ; les 23+ écritures seed restent inchangées ; aucune API/UI d'édition n'existe | | NON TESTÉ | |
| TC-NF525-002 | Numérotation continue sans trou (seq) | FISC-1, SYNC-4 | Critique | base de données | 10 écritures enregistrées sur POSTE-01 | 1) Lister les seq 1..N du journal local 2) Supprimer aucune écriture, annuler la vente n°5 (nouvelle écriture ANNULATION) 3) Relister | Seq strictement 1,2,3…N sans trou ni doublon ; l'annulation a reçu la seq N+1 ; préfixe `POSTE-01-` présent sur chaque référence | | NON TESTÉ | |
| TC-NF525-003 | Aucune écriture anonyme | FISC-3 | Critique | fonctionnel | Session ouverte matricule MGR | 1) Réaliser vente, encaissement, annulation, remise, clôture Z 2) Exporter le journal 3) Vérifier chaque écriture | 100 % des écritures portent matricule + nom ; 0 écriture sans auteur ; validateur présent sur annulation/remise | | NON TESTÉ | |
| TC-NF525-004 | Chaînage SHA-256 complet et vérifiable | FISC-2 | Critique | base de données | Journal ≥ 5 écritures | 1) Calculer `SHA-256(hash_prev ‖ payload canonique)` de chaque écriture (script SQL/Node) 2) Comparer au `hash_self` stocké | Chaque écriture : `hash_self` recalculé = `hash_self` stocké ; `hash_prev(n)` = `hash_self(n-1)` ; résultat du contrôle global : `chainVerified:true` | | NON TESTÉ | |
| TC-NF525-005 | Contrôle de chaînage à la clôture et à la réception cloud | FISC-2, SYNC-2 | Critique | fonctionnel | Préprod locale + backend | 1) Clôturer Z 2) Consulter le compte rendu de clôture 3) Pousser le lot au cloud 4) Lire la réponse push | Chaque clôture/push exécute un contrôle de chaînage complet ; réponse push `chainVerified:true` ; en cas de rupture simulée en préprod isolée → `chainVerified:false` + rejet | | NON TESTÉ | |
| TC-NF525-006 | Horloge non reculable (monotonic guard) | FISC-4 | Critique | fonctionnel | Tablette caisse, mode avion OFF, accès réglages dev | 1) Enregistrer une vente à T 2) Reculer l'horloge système de 30 min 3) Enregistrer une seconde vente 4) Exporter le journal | L'horodatage de la vente 2 n'est jamais antérieur au dernier enregistré (monotonic guard appliqué) ; le recul d'horloge a généré un événement `CHANGEMENT_HEURE` journalisé | | NON TESTÉ | |
| TC-NF525-007 | Clôture Z scellée signée | FISC-5 | Critique | fonctionnel | 1 journée de ventes sur POSTE-01 | 1) Déclencher Z depuis l'écran caisse (gérant) 2) Ouvrir le scellé 3) Vérifier la signature asymétrique | Le scellé contient totaux HT/TVA par taux/TTC, nb tickets, dernier seq/hash ; la signature est valide (clé Keystore) ; le scellé est exportable | | NON TESTÉ | |
| TC-NF525-008 | Une seule Z par jour et par poste | FISC-5 | Critique | fonctionnel | Z du jour déjà réalisée | 1) Tenter une seconde clôture Z le même jour sur POSTE-01 2) Tenter Z sur POSTE-02 le même jour | La seconde Z sur le même poste est refusée avec message explicite ; POSTE-02 peut clôturer (compteur indépendant) ; la première Z reste en base inchangée | | NON TESTÉ | |
| TC-NF525-009 | Détection d'altération → refus d'encaissement | FISC-7 | Critique | fonctionnel | Copie de préprod isolée (jamais les données réelles) | 1) Modifier le payload d'une écriture dans la copie SQLite 2) Lancer l'app caisse 3) Tenter d'encaisser | Au démarrage, le contrôle complet détecte la rupture ; l'app refuse le service d'encaissement ; l'incident est affiché ET exportable ; la copie de test est détruite après le test | | NON TESTÉ | |
| TC-NF525-010 | Réplique cloud fidèle et append-only | FISC-8 | Critique | base de données | Backend préprod, 23 écritures seed répliquées | 1) Comparer ligne à ligne `journal_replica` vs le lot poussé (ref, type, payload, hash) 2) Tenter une UPDATE/DELETE SQL sur `journal_replica` 3) Chercher toute API d'écriture manuelle | La réplique est identique au journal source ; aucune UPDATE/DELETE possible (procédure : incidents constatés) ; le serveur ne réécrit jamais ; un auditeur peut reconstituer la chaîne depuis la réplique | | NON TESTÉ | |
| TC-NF525-011 | Ticket conforme : mentions légales + empreinte | POS-5, IMP-5 | Critique | interface | Imprimante ESC/POS appairée, 1 vente encaissée | 1) Encaisser 2) Imprimer le ticket 3) Vérifier les champs imprimés | Le ticket porte : numéro continu `POSTE-01-000XXX`, date/heure, nom/adresse/SIRET, détail articles, TVA par taux, total, mode de paiement, matricule caissier, empreinte courte du hash ; modèle configurable mais champs légaux non modifiables (test TC-BO-009) | | NON TESTÉ | |
| TC-NF525-012 | Annulation = nouvelle écriture, jamais modification | FISC-1, POS-6 | Critique | base de données | 1 vente encaissée, validation second configurée | 1) Annuler un article (motif + matricule + PIN demandeur) 2) Valider avec le second 3) Compter les écritures de la vente | Le compte d'écritures passe de N à N+2 (ANNULATION + éventuel validateur) ; l'écriture d'origine est intacte (payload avant/après identique) ; motif + validateur présents | | NON TESTÉ | |
| TC-NF525-013 | Push re-vérifie le chaînage, rejet lot rompu | SYNC-2 | Critique | base de données | Copie préprod isolée ; un lot avec un hash intermédiaire corrompu | 1) Pousser le lot corrompu à `POST /api/sync/push` 2) Lire la réponse 3) Compter les écritures répliquées | Le lot est rejeté (`rejected ≥ 1`, `chainVerified:false`) ; la réplique n'absorbe AUCUNE écriture du lot rompu ; incident journalisé côté serveur | | NON TESTÉ | |
| TC-NF525-014 | Export de contrôle fiscal complet et vérifiable | BO-5, FISC-8 | Critique | fonctionnel | Session gérant ou expert-comptable | 1) Générer export `complet/json` 2) Recalculer l'empreinte SHA-256 du payload hors ligne 3) Comparer à la ligne EMPREINTE | L'empreinte recalculée = EMPREINTE du fichier ; le fichier contient journal complet + clôtures Z + scellés ; l'export est journalisé (visible dans `/audit`) | | NON TESTÉ | |
| TC-NF525-015 | Panne d'imprimante ne bloque jamais l'écriture fiscale | IMP-3 | Critique | fonctionnel | Imprimante volontairement hors ligne (câble débranché) | 1) Encaisser une vente 2) Observer le ticket 3) Consulter le journal 4) Rebrancher l'imprimante | L'écriture fiscale existe dans le journal AVANT toute tentative d'impression ; l'encaissement réussit malgré la panne ; le ticket est en file d'attente et réimprimé au retour de la connexion | | NON TESTÉ | |
| TC-NF525-016 | Conservation 6 ans, aucune purge anticipée | FISC-8 | Critique | base de données | Réplique préprod avec écritures > 6 mois (jeu de dates factices) | 1) Chercher tout job/cron/TTL de purge 2) Chercher toute clause DELETE datée 3) Tenter d'exporter une écriture vieille de 6 ans (jeu de données factice) | Aucun mécanisme de purge n'existe dans le code (grep sources : 0 résultat DELETE daté) ; les écritures de plus de 6 ans restent consultables/exportables | | NON TESTÉ | |

---

## 5. ⛔ Cas de test offline-first (BLOQUANTS)

> **Ces tests valident le cœur de la promesse produit : la caisse fonctionne sans réseau.** Un échec = NO-GO. Tous sur copie préprod isolée ; jamais sur la prod.

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-OFF-001 | Encaissement complet en mode avion | POS-4, FISC-1 | Critique | fonctionnel | Tablette caisse synchronisée, données pull récentes | 1) Activer le mode avion 2) Ouvrir une commande, saisir 3 articles 3) Encaisser en espèces 4) Imprimer le ticket | Toutes les opérations réussissent sans réseau ; écritures VENTE/PAIEMENT/TICKET dans le journal local avec seq continuent ; état « hors ligne » visible dans l'UI | | NON TESTÉ | |
| TC-OFF-002 | 3 jours hors ligne : numérotation continue | SYNC-4 | Critique | fonctionnel | Mode avion activé sur tablette de test | 1) Jour 1 : 5 ventes 2) Jour 2 : 8 ventes 3) Jour 3 : 4 ventes 4) Désactiver le mode avion 5) Laisser la sync se terminer | 17 écritures + événements, seq sans trou ni doublon, préfixe `POSTE-01-` ; après sync, `journal_replica` contient exactement les 17 écritures dans l'ordre ; aucune perte | | NON TESTÉ | |
| TC-OFF-003 | Crash brutal en pleine vente | SYNC-5 | Critique | fonctionnel | Vente en cours (2 articles ajoutés, non encaissés) | 1) Forcer le kill de l'app (adb shell am force-stop) au milieu de l'ajout 2) Redémarrer l'app 3) Vérifier le journal | Le contrôle de chaînage au démarrage passe (aucune écriture partielle : transaction/WAL SQLite) ; les écritures validées avant le crash sont intactes ; la vente en cours est soit récupérée soit proprement abandonnée — jamais un journal incohérent | | NON TESTÉ | |
| TC-OFF-004 | Deux postes hors ligne en parallèle, sans collision | SYNC-4 | Critique | base de données | POSTE-01 et POSTE-02 provisionnés, tous deux en mode avion | 1) Vendre 5 articles sur POSTE-01 2) Vendre 5 articles sur POSTE-02 3) Rétablir le réseau 4) Pousser les deux lots | Chaque poste garde sa numérotation propre (`POSTE-01-…`, `POSTE-02-…`) ; aucune collision de seq/référence ; les 10 écritures coexistent dans la réplique ; chaînage vérifié par poste | | NON TESTÉ | |
| TC-OFF-005 | Double envoi UUID : une seule écriture | SYNC-1 | Critique | base de données | Une vente avec UUID connu en réplique | 1) Pousser le même lot 2 fois de suite (même `uuidOp`) 2) Compter les écritures dans `journal_replica` | Réponse push : 1er envoi `accepted:1`, 2e envoi `duplicates:1, accepted:0` ; le nombre total d'écritures est strictement identique avant/après (testé : 23→23) | | NON TESTÉ | |
| TC-OFF-006 | File persistante, ordre préservé après coupure réseau | SYNC-7 | Critique | fonctionnel | 3 ventes en attente de sync | 1) Couper le réseau 2) Faire 3 ventes 3) Rétablir 5 s 4) Couper de nouveau 5) Faire 2 ventes 6) Rétablir définitivement | Les 5 écritures partent dans l'ordre des seq (lots ordonnés) ; aucun saut ni réordonnancement ; le backoff ne réinitialise pas l'ordre ; `chainVerified:true` final | | NON TESTÉ | |
| TC-OFF-007 | Démarrage hors réseau au premier lancement du jour | FISC-2 | Haute | fonctionnel | Tablette éteinte, Wi-Fi coupé | 1) Démarrer l'app caisse sans réseau 2) Contrôle de chaînage au démarrage 3) Encaisser | Le contrôle de chaînage local s'exécute sans réseau ; l'app est opérationnelle ; aucun blocage erroné « serveur injoignable » pour les fonctions locales | | NON TESTÉ | |
| TC-OFF-008 | Conflit de pull pendant vente en cours | SYNC-3 | Haute | fonctionnel | Gérant modifie un prix au BO pendant une vente sur tablette | 1) Modifier le prix d'un article au BO 2) Déclencher un pull pendant la vente ouverte sur tablette 3) Observer la ligne de commande ouverte | La ligne en cours garde son prix figé (snapshot à l'ajout, POS-2) ; le nouveau prix s'applique aux prochains ajouts ; le changement de prix génère l'écriture `CHANGEMENT_PRIX` (BO-1) | | NON TESTÉ | |
| TC-OFF-009 | Licence expirée hors ligne : dégradation, jamais de perte | LIC-3, SYNC-6 | Haute | fonctionnel | Préprod, licence passée en grace2/bloquee, tablette en cache licence | 1) Mettre la licence en grace2 2) Synchroniser la tablette 3) Couper le réseau 4) Encaisser 5) Tenter d'ouvrir le BO | Caisse locale opérationnelle (encaissement, journal, Z) ; la sync cloud renvoie 403 « Synchronisation suspendue » ; aucune donnée supprimée ni bloquée ; export fiscal toujours disponible (LIC-4) | | NON TESTÉ | |
| TC-OFF-010 | Reconnexion : reprise complète automatique | SYNC-3, SYNC-7 | Haute | fonctionnel | Suite de TC-OFF-002 | 1) Après reprise réseau, laisser 2 min 2) Vérifier BO : journal, rapports du jour, tickets 3) Faire 1 vente en ligne | Tout le backlog hors ligne est répliqué ; le BO affiche les 17 écritures ; les rapports du jour incluent les ventes faites hors ligne ; la vente « en ligne » suit normalement | | NON TESTÉ | |

---

## 6. Bloc FISC — journal permanent (hors cas NF525 déjà listés)

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-FISC-001 | Tous les types d'événements sont journalisés | FISC-1 | Haute | fonctionnel | Tablette caisse, session MGR | 1) Enchaîner vente, encaissement, ticket, annulation, remise, changement de prix, ouverture/fermeture session, clôture Z 2) Exporter le journal | Les 9 types d'événements figurent dans le journal, chacun avec seq, horodatage, matricule | | NON TESTÉ | |
| TC-FISC-002 | Écriture de session utilisateur (ouverture/fermeture) | FISC-3 | Haute | fonctionnel | Tablette caisse | 1) Ouvrir une session matricule S07 2) Fermer la session 3) Lire le journal | Deux écritures SESSION_OUVERTURE / SESSION_FERMETURE portent le matricule S07 et l'horodatage local | | NON TESTÉ | |
| TC-FISC-003 | Saut d'horloge > 60 s : journalisation + correction progressive | FISC-4 | Haute | fonctionnel | Tablette connectée au serveur de préprod | 1) Avancer l'horloge de 5 min 2) Synchroniser 3) Lire le journal et l'heure corrigée | Un événement CHANGEMENT_HEURE est journalisé ; la correction est progressive (jamais un saut brutal des écritures) ; les horodatages passés restent intacts | | NON TESTÉ | |
| TC-FISC-004 | Clôture Z accessible depuis l'écran caisse (POS-9) | FISC-5, POS-9 | Haute | fonctionnel | Comptes caisse MGR (gérant) et S07 (serveur) | 1) Tenter Z avec le matricule serveur S07 2) Tenter Z avec MGR | S07 est refusé (message explicite) ; MGR réussit ; la Z est journalisée dans le journal (type CLOTURE_Z) | | NON TESTÉ | |
| TC-FISC-005 | Clôture mensuelle consolidée cloud signée | FISC-6 | Moyenne | fonctionnel | Préprod avec ≥ 2 Z répliquées de jours distincts | 1) Générer la clôture mensuelle au BO 2) Vérifier la signature serveur 3) Comparer les totaux à l'agrégation des Z | La consolidation est une agrégation vérifiée des Z (aucune recomputation des écritures) ; la signature serveur est valide ; les totaux = somme des Z | | NON TESTÉ | |
| TC-FISC-006 | Incident d'altération exportable | FISC-7 | Haute | fonctionnel | Suite de TC-NF525-009 | 1) Sur la copie altérée, ouvrir l'incident 2) Exporter l'incident 3) Vérifier le contenu | L'export d'incident contient la position de la rupture (seq, hashes), la date, le poste ; format réutilisable par un auditeur | | NON TESTÉ | |
| TC-FISC-007 | Reconstitution auditeur depuis la réplique seule | FISC-8 | Haute | base de données | Préprod, réplique cloud complète | 1) À partir de `journal_replica` uniquement, recalculer toute la chaîne SHA-256 2) Reconstruire les totaux du jour | La chaîne se recalcule intégralement depuis la réplique (aucune information manquante) ; les totaux reconstruits = totaux de la Z du jour | | NON TESTÉ | |
| TC-FISC-008 | Horloge du serveur n'écrase jamais les horodatages locaux | FISC-4, FISC-8 | Haute | base de données | Écritures poussées avec horodatage local différent du serveur | 1) Pousser un lot 2) Lire `journal_replica` côté cloud | Les horodatages cloud = horodatages locaux (le serveur n'écrase jamais) ; écarts conservés tels quels | | NON TESTÉ | |

---

## 7. Bloc POS — caisse & encaissement (tablette)

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-POS-001 | Ouvrir une commande sur une table | POS-1 | Critique | fonctionnel | Plan de salle synchronisé, session serveur S07 | 1) Sélectionner la table T2 2) Ajouter 2 articles 3) Vérifier le journal | Une commande active s'ouvre sur T2 ; écriture journalisée avec utilisateur ; une seule commande active par table | | NON TESTÉ | |
| TC-POS-002 | Transférer et fusionner des commandes | POS-1 | Haute | fonctionnel | Commandes ouvertes sur T2 et T3 | 1) Transférer la commande T2 → T5 2) Fusionner T3 dans T5 3) Vérifier le journal | Le transfert et la fusion génèrent chacun une écriture journalisée ; T2 est libérée ; une table = une commande active max à tout instant | | NON TESTÉ | |
| TC-POS-003 | Prix figés à l'ajout (snapshot) | POS-2 | Critique | fonctionnel | Article « Plat du jour » à 14 € | 1) Ajouter l'article à une commande 2) Faire monter le prix à 16 € au BO + push 3) Observer la ligne en cours | La ligne ouverte reste à 14 € (snapshot) ; les futurs ajouts prennent 16 € ; le changement de prix a généré l'écriture CHANGEMENT_PRIX | | NON TESTÉ | |
| TC-POS-004 | Variantes / suppléments dans la saisie | POS-2 | Haute | fonctionnel | Article avec variantes configurées | 1) Ajouter l'article avec variante + supplément 2) Vérifier la ligne et le journal | La variante/supplément s'ajoute au prix de la ligne ; détail visible dans le ticket ; journalisé dans la ligne de commande | | NON TESTÉ | |
| TC-POS-005 | Envoi cuisine + ticket complémentaire | POS-3 | Haute | fonctionnel | Commande avec 3 articles | 1) Envoyer à la cuisine 2) Ajouter 1 supplément et renvoyer 3) Vérifier le KDS et le journal | L'envoi génère une écriture VENTE ; le KDS affiche la commande sans prix ; le supplément en cours de service émet un ticket complémentaire | | NON TESTÉ | |
| TC-POS-006 | Encaissement espèces avec calcul du rendu | POS-4 | Critique | fonctionnel | Total commande 23,50 € | 1) Encaisser avec 30 € en espèces 2) Lire le rendu proposé 3) Valider | Le rendu calculé = 6,50 € ; écriture PAIEMENT avec montant + mode ; la commande passe « payée » | | NON TESTÉ | |
| TC-POS-007 | Paiement mixte + TPE externe | POS-4 | Haute | fonctionnel | TPE externe appairé (préprod de simulation) | 1) Encaisser 10 € par carte (résultat TPE simulé) 2) Compléter avec 8,50 € en espèces 3) Vérifier le journal | Les deux parts sont enregistrées (montant, mode, résultat TPE) ; total cohérent ; un seul ticket ou un ticket par mode selon le paramétrage | | NON TESTÉ | |
| TC-POS-008 | Annulation complète de commande | POS-6 | Haute | fonctionnel | Commande ouverte non encaissée, second configuré | 1) Annuler la commande (motif « erreur de table », PIN MGR) 2) Valider par le second 3) Vérifier le journal | Écriture ANNULATION avec motif + demandeur + validateur ; la vente d'origine inchangée ; la table est libérée | | NON TESTÉ | |
| TC-POS-009 | Remise plafonnée refusée au-delà du seuil | POS-7 | Haute | fonctionnel | Plafond serveur = 10 % | 1) S07 tente une remise de 20 % 2) MGR tente une remise de 20 % (si plafond gérant supérieur) | La remise S07 > plafond est refusée avec message ; les remises autorisées génèrent une écriture REMISE (motif + matricule) ; plafonds modifiables par le gérant (BO-2) | | NON TESTÉ | |
| TC-POS-010 | Changement de prix en cours de service | POS-7 | Haute | fonctionnel | Commande ouverte, droit gérant | 1) Modifier le prix d'une ligne (motif « erreur carte ») 2) Vérifier le journal | Écriture CHANGEMENT_PRIX avec ancien/nouveau prix, motif, matricule ; total recalculé ; écriture originale intacte | | NON TESTÉ | |
| TC-POS-011 | Annulation exige PIN du demandeur | POS-6, SEC | Critique | sécurité | Second configuré, S07 connecté | 1) Annuler un article en saisissant le PIN de MGR (pas le sien) 2) Puis avec le PIN de S07 | L'annulation avec le PIN d'un autre utilisateur est refusée ; la demande valide exige le PIN du demandeur + validation du second | | NON TESTÉ | |
| TC-POS-012 | Validateurs refusés : motif et matricule obligatoires | POS-6, POS-7 | Haute | interface | Annulation/remise en cours | 1) Tenter une annulation sans motif 2) Tenter sans PIN 3) Corriger | Les deux tentatives sont refusées avec champs surlignés ; aucune écriture n'est créée tant que les champs sont vides | | NON TESTÉ | |
| TC-POS-013 | Comptoir / à emporter sans table | POS-8 | Haute | fonctionnel | Écran caisse | 1) Créer une vente « comptoir » 2) Encaisser 3) Vérifier le journal et le ticket | La vente fonctionne sans table ; type de commande différencié dans le journal (COMPTEUR/EMPORTER) ; même chaîne fiscale (seq, hash) | | NON TESTÉ | |
| TC-POS-014 | Un seul encaissement par commande | POS-4 | Moyenne | fonctionnel | Commande encaissée | 1) Tenter de re-encaisser la même commande 2) Payer un acompte puis le solde (si paramétré) | Le double encaissement est refusé ; les écritures PAIEMENT existantes restent visibles et intangibles | | NON TESTÉ | |

---

## 8. Bloc SYNC — synchronisation offline-first (hors cas bloquants déjà listés)

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-SYNC-001 | UUID généré côté appareil, jamais côté serveur | SYNC-1 | Haute | base de données | Tablette en mode avion, 3 ventes | 1) Créer 3 ventes hors ligne 2) Inspecter les UUID générés localement 3) Pousser | Chaque écriture porte un UUID v4 généré avant le push ; la déduplication serveur s'appuie sur (restaurant_id, uuid) | | NON TESTÉ | |
| TC-SYNC-002 | Push par lots ordonnés par seq | SYNC-2 | Haute | base de données | Backlog de 10 écritures | 1) Pousser le backlog 2) Lire `journal_replica` trié par seq | Les écritures arrivent dans l'ordre croissant des seq ; `chainVerified:true` ; aucun interclassement | | NON TESTÉ | |
| TC-SYNC-003 | Pull delta par updated_at | SYNC-3 | Haute | fonctionnel | Pull déjà réalisé, 1 article modifié au BO | 1) Pull à nouveau 2) Observer le volume échangé | Seul l'article modifié (et les deltas) transitent — pas un full resync ; « dernière version serveur gagnante » sur le prix | | NON TESTÉ | |
| TC-SYNC-004 | Pull diffuse menu, TVA, utilisateurs, droits, tables | SYNC-3 | Critique | fonctionnel | BO : 1 article + 1 matricule + 1 table ajoutés | 1) Pull depuis la tablette 2) Vérifier la présence des nouveautés | La carte, les matricules (PIN hashé jamais transmis en clair), les tables et droits sont à jour sur l'appareil | | NON TESTÉ | |
| TC-SYNC-005 | Lots partiels jamais sautés | SYNC-7 | Haute | base de données | Backlog en 3 lots | 1) Bloquer volontairement le lot 2 (simulation erreurs réseau) 2) Rétablir | Les lots se réenvoient intégralement ; aucun lot sauté ; le seq final ne présente aucun trou | | NON TESTÉ | |
| TC-SYNC-006 | Contrôle de chaînage à la réception cloud | FISC-2, SYNC-2 | Critique | base de données | Suite de TC-NF525-004 côté serveur | 1) Pousser un lot valide 2) Lancer le contrôle de chaînage côté réplique | La réplique re-vérifie le chaînage complet du lot à la réception ; résultat `chainVerified:true` exposé dans la réponse | | NON TESTÉ | |
| TC-SYNC-007 | Sync sans session utilisateur (appareil) — jeton dédié | SYNC-6, SEC | Haute | sécurité | Jeton appareil `device-token-demo-POSTE-01` | 1) Appeler push/pull sans session web, Bearer valide 2) Bearer invalide 3) Sans Bearer | Valide → 200 ; invalide/sans → 401 « Jeton d'appareil invalide » (comportement déjà vérifié sur le BO cloud) | | NON TESTÉ | |
| TC-SYNC-008 | Two-way : pull avant push à la reconnexion | SYNC-3, SYNC-7 | Moyenne | fonctionnel | Backlog local + deltas serveur simultanés | 1) Reconnecter 2) Observer l'ordre des opérations | Le pull des références s'exécute avant le push du journal (ordre documenté) ; aucune écriture perdue dans les deux sens | | NON TESTÉ | |
| TC-SYNC-009 | Taille de lot et réenvoi partiel | SYNC-7 | Basse | performance | Backlog de 500 écritures factices | 1) Pousser en lot unique 2) Observer découpage/réenvoi | Le lot est segmenté selon la limite paramétrée ; un échec réseau en milieu de lot ne rejoue que la partie non confirmée (idempotence intacte) | | NON TESTÉ | |
| TC-SYNC-010 | Horloge du push vs monotonic guard serveur | FISC-4, SYNC-2 | Haute | base de données | Lot contenant un horodatage antérieur au dernier enregistré | 1) Pousser ce lot 2) Lire la réponse | L'écriture est rejetée ou horodatée conformément au monotonic guard — la chronologie de la réplique reste monotone | | NON TESTÉ | |

---

## 9. Bloc TERM — terminaux de prise de commande (salle)

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-TERM-001 | Login matricule + PIN validé localement | TERM-1 | Critique | fonctionnel | Terminal provisionné, base utilisateurs synchronisée, tablette caisse ON | 1) Saisir matricule S07 + PIN 3456 2) Saisir un PIN erroné 3x | Connexion locale réussie (même réseau coupé) ; 3 échecs → session bloquée selon la règle (5 échecs = verrouillage serveur) | | NON TESTÉ | |
| TC-TERM-002 | Commande envoyée en LAN à la tablette caisse | TERM-2 | Critique | fonctionnel | Terminal + tablette caisse sur le même LAN | 1) Prendre une commande à la table T4 2) Envoyer 3) Vérifier tablette caisse | La commande arrive sur la tablette en < 2 s ; elle porte un UUID terminal ; écriture côté caisse avec référence terminal | | NON TESTÉ | |
| TC-TERM-003 | Idempotence de l'envoi (double tap) | TERM-2 | Haute | fonctionnel | Commande prête à envoyer | 1) Tapper « Envoyer » deux fois rapidement | Une seule commande est créée côté caisse (UUID terminal déduplique) ; pas de doublon KDS | | NON TESTÉ | |
| TC-TERM-004 | Suivi d'état de la commande | TERM-4 | Moyenne | interface | Commande envoyée, KDS actif | 1) Observer l'état « envoyée » 2) KDS : démarrer → « en préparation » 3) KDS : prêt → « servie » | L'état du terminal reflète chaque transition KDS en < 2 s (LAN) ; lecture seule (le terminal ne peut pas changer l'état KDS) | | NON TESTÉ | |
| TC-TERM-005 | Découverte mDNS + provisioning < 10 min | TERM-5, SEC-4 | Moyenne | compatibilité | Tablette Android neuve, checklist installation | 1) Installer l'APK 2) Découvrir la tablette caisse via mDNS/IP 3) Provisionner le jeton terminal | Découverte réussie sans saisie manuelle d'IP (ou IP saisie en secours) ; provisioning complet en < 10 min chronométré | | NON TESTÉ | |
| TC-TERM-006 | Paiement techniquement désactivé sur terminal (build + runtime) | TERM-3, POS-4 | Critique | sécurité | APK terminal de salle | 1) Inspecter l'UI du terminal (aucun écran de paiement) 2) Analyser l'APK (aucun code/endpoint d'encaissement exécutable) 3) Tenter d'appeler l'endpoint d'encaissement depuis le terminal | Aucun écran de paiement ; aucun code d'encaissement embarqué ; l'appel réseau direct à l'endpoint d'encaissement est refusé côté runtime ; conforme test A10 n° 17 | | NON TESTÉ | |

---

## 10. Bloc KDS — écran cuisine

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-KDS-001 | Tickets en colonnes avec temps d'attente | KDS-1 | Critique | interface | 3 commandes envoyées à des instants différents | 1) Ouvrir le KDS 2) Observer les colonnes | Colonnes « nouveau / en cours / prêt » ; tri chronologique ; temps d'attente visible et croissant | | NON TESTÉ | |
| TC-KDS-002 | Actions démarrer / marquer prêt | KDS-2 | Critique | fonctionnel | Ticket dans « nouveau » | 1) Démarrer le ticket 2) Le marquer prêt 3) Vérifier terminal et journal | Le ticket change de colonne ; le terminal voit « en préparation » puis « servie/prêt » ; les transitions sont journalisées | | NON TESTÉ | |
| TC-KDS-003 | Signalement de rupture propagé en salle | KDS-2 | Haute | fonctionnel | Ticket avec article X | 1) Signaler rupture sur X 2) Vérifier le terminal de salle | La rupture est visible immédiatement côté salle (badge/liste) ; événement journalisé | | NON TESTÉ | |
| TC-KDS-004 | Non-fuite : jamais de prix sur le KDS | KDS-3 | Critique | sécurité | Commandes avec prix connus | 1) Inspecter l'UI KDS (aucun montant) 2) Inspecter les réponses de l'API KDS (payload réseau) 3) Chercher tout champ prix/total | Aucun prix ni donnée financière nulle part (UI + API filtrée) ; test de non-fuite documenté | | NON TESTÉ | |
| TC-KDS-005 | Connexion matricule + PIN sur le KDS | KDS-4 | Haute | fonctionnel | KDS déverrouillé | 1) Se connecter avec K01 + PIN 4567 2) PIN erroné | Connexion réussie (rôle cuisine) ; PIN erroné refusé avec compteur d'échecs | | NON TESTÉ | |
| TC-KDS-006 | Verrouillage à l'inactivité | KDS-4, SEC-5 | Haute | fonctionnel | Session KDS ouverte | 1) Ne rien toucher pendant le délai paramétré 2) Tenter une action | L'écran se verrouille après inactivité (2–5 min selon paramétrage) ; réouverture par matricule + PIN ; aucune action possible verrouillé | | NON TESTÉ | |

---

## 11. Bloc BO — back-office web (exécutable sur préprod actuelle)

> Préconditions communes : préprod `http://localhost:3000` après `make check` (11/11 PASS), session ouverte selon le cas (cookies `/tmp/jg.txt` gérant, `/tmp/jc.txt` comptable, `/tmp/ja.txt` auditeur, `/tmp/ja2.txt` admin).

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-BO-001 | RBAC complet 4 rôles × 11 pages | BO-1…8 | Critique | sécurité | 4 sessions valides (make info pour la liste) | 1) Pour chaque rôle, visiter les 11 pages (/ , /dashboard, /menu, /utilisateurs, /tables, /rapports, /journal, /exports, /ticket-modele, /licence, /audit) | 44/44 conforme à `lib/auth.js` : menu/utilisateurs/tables/ticket → gérant seul ; journal/exports → sauf admin ; rapports/audit/licence/dashboard → tous ; écran « Accès refusé (403) » sinon | | NON TESTÉ | |
| TC-BO-002 | Versionnement prix à la modification | BO-1 | Haute | base de données | Session gérant, article existant | 1) PATCH prix 12,50 € → 13 € via /api/articles/[id] 2) Consulter le journal d'audit | La version de l'article est incrémentée ; l'audit trace l'ancien/nouveau prix ; les appareils reçoivent le nouveau prix au prochain pull | | NON TESTÉ | |
| TC-BO-003 | Création matricule avec PIN hashé | BO-2 | Critique | base de données | Session gérant | 1) POST /api/users-mobile (matricule S99, PIN 9999) 2) Lire la base : `SELECT pin_hash…` | Le PIN est stocké hashé (bcrypt/Argon2), jamais en clair ; le mot de passe/API ne le renvoie jamais ; écriture d'audit créée | | NON TESTÉ | |
| TC-BO-004 | Désactivation ≠ suppression + propagation | BO-2 | Haute | fonctionnel | Matricule S99 actif | 1) DELETE /api/users-mobile/[id] 2) Vérifier la base 3) Pull depuis l'appareil | `actif=false`, la ligne existe toujours (jamais de suppression) ; le matricule ne peut plus se connecter après le prochain sync | | NON TESTÉ | |
| TC-BO-005 | Tables & salles CRUD | BO-3 | Haute | fonctionnel | Session gérant | 1) POST /api/tables (T99, Salle 1, 4 places) 2) PATCH places 2) DELETE | Création/modification/désactivation OK, auditées ; la table disparaît du plan de salle après sync | | NON TESTÉ | |
| TC-BO-006 | Rapports multi-dimensions depuis la réplique | BO-4 | Haute | fonctionnel | Session gérant, données du jour (88,60 € seed) | 1) Ouvrir /rapports 2) Filtrer du/au 3) Comparer aux écritures brutes | Totaux par jour, TVA par taux, par serveur, top articles ; total période = somme des écritures répliquées ; dates formatées en français | | NON TESTÉ | |
| TC-BO-007 | Cohérence rapport ↔ chaînage | BO-4 | Haute | base de données | Données du jour | 1) Recalculer le total du jour par requête SQL directe 2) Comparer au rapport | Chiffres identiques (la source est la réplique vérifiée par chaînage) ; écart éventuel ⇒ FAIL | | NON TESTÉ | |
| TC-BO-008 | Export signé CSV + JSON avec recalcul d'empreinte | BO-5 | Critique | fonctionnel | Session comptable | 1) POST /api/exports (journal/csv puis complet/json) 2) Télécharger 3) Recalculer SHA-256 | L'empreinte recalculée = ligne EMPREINTE du fichier ; les deux formats se génèrent ; consultation lecture du journal répliqué possible | | NON TESTÉ | |
| TC-BO-009 | Champs légaux du ticket non modifiables | BO-1, IMP-5 | Haute | interface | Session gérant, /ticket-modele | 1) Modifier logo et mention complémentaire 2) PATCH /api/ticket-template 3) Tenter de vider le SIRET / numéro journal | Logo + mentions complémentaires persistés ; les champs légaux (SIRET, TVA par taux, numéro journal, poste) ne sont pas modifiables par le modèle | | NON TESTÉ | |
| TC-BO-010 | Journal répliqué strictement lecture seule | BO-6 | Critique | sécurité | Session gérant, /journal | 1) Ouvrir /journal 2) Chercher toute action d'écriture (bouton, endpoint) 3) Tenter un POST/PATCH sur les écritures | Aucun bouton d'écriture ; tout endpoint d'édition d'écriture renvoie 403/404 ; la page liste, filtre, recherche uniquement | | NON TESTÉ | |
| TC-BO-011 | Audit logs append-only | BO-8 | Haute | base de données | Préprod | 1) Effectuer 5 actions auditées (login, CRUD article, export, licence) 2) Lire /audit 3) Tenter modification des logs | Chaque action figure (qui, quoi, quand, résultat) ; aucune modification/suppression possible des logs ; filtres fonctionnels | | NON TESTÉ | |
| TC-BO-012 | Connexions journalisées + verrouillage 5 échecs | BO-8, SEC | Haute | sécurité | Préprod, compte gerant@local.test | 1) 5 échecs de mot de passe 2) 6e tentative 3) Connexion réussie puis /audit | Le 6e essai est refusé (verrouillage) ; les échecs et le verrouillage figurent dans /audit ; déblocage via procédure gérant/admin | | NON TESTÉ | |
| TC-BO-013 | CSRF : Origin hostile refusé partout | SEC (BO) | Critique | sécurité | Session gérante valide | 1) POST/PATCH/DELETE sur chaque endpoint d'écriture avec `Origin: https://evil.example` 2) Sans Origin (toléré : cookie SameSite=Lax, décision documentée `lib/http.js`) | Origin hostile → 403 sur tous les endpoints ; sans Origin → traité (cookie Lax non envoyé cross-site) ; aucune mutation adverse | | NON TESTÉ | |
| TC-BO-014 | États interface : chargement, vide, erreur | BO (UX) | Haute | interface | Préprod ; base temporairement arrêtée pour le test d'erreur | 1) Ouvrir chaque page avec données vides 2) Simuler une erreur (base stoppée 5 s) 3) Rétablir | Chaque page affiche un état vide propre (« Aucune vente ») et une bannière d'erreur explicite avec action « Réessayer » fonctionnelle ; styles locaux chargés sans CDN | | NON TESTÉ | |

---

## 12. Bloc LIC — licence & dégradation progressive

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-LIC-001 | Admin modifie l'état, gérant refusé | BO-7, LIC | Haute | sécurité | Sessions admin et gérant | 1) PATCH /api/licence `{"etat":"active"}` en admin 2) Idem en gérant | Admin → 200 ; gérant → 403 ; l'état et les dates de phases sont mis à jour | | NON TESTÉ | |
| TC-LIC-002 | Phase 1 (J+0→30) : rappels non bloquants | LIC-2 | Haute | interface | Licence `impayee` J+5 (préprod) | 1) Consulter le BO et la tablette 2) Vérifier les canaux (in-app, BO, e-mail simulé) | Toutes les fonctions marchent ; rappels visibles et non bloquants ; aucun refus de sync/encaissement | | NON TESTÉ | |
| TC-LIC-003 | Phase 2 (grace1/grace2) : cloud suspendu, caisse OK | LIC-3 | Critique | fonctionnel | Licence grace2 sur préprod | 1) `GET /api/licence/status` (Bearer appareil) → etat grace2 2) POST /api/sync/push 3) Encaisser côté tablette | Sync → 403 « Synchronisation suspendue — état de licence » ; back-office/rapports avancés suspendus ; encaissement, journal et Z fonctionnent ; bandeau d'information à l'ouverture | | NON TESTÉ | |
| TC-LIC-004 | Phase 3 (> J+60) : blocage lancement, export possible | LIC-4 | Critique | fonctionnel | Licence bloquee sur préprod | 1) Tenter de lancer l'app tablette 2) Tenter un export du journal (moyen d'extrusion) | Le lancement mobile est bloqué avec message clair (contact commercial) ; les données fiscales restent exportables sur demande (toujours_disponible) | | NON TESTÉ | |
| TC-LIC-005 | Rétablissement immédiat dès régularisation | LIC-5 | Haute | fonctionnel | Suite de TC-LIC-003/004 | 1) PATCH licence → active (admin) 2) Réessayer sync et lancement | La sync redevient 200 immédiatement ; l'app relance normalement ; la numérotation continue sans trou (aucun reset) | | NON TESTÉ | |
| TC-LIC-006 | Jeton vérifié à chaque sync + cache hors ligne | LIC-1, SYNC-6 | Haute | sécurité | Préprod, tablette synchronisée | 1) Forcer un jeton altéré à la sync 2) Couper le réseau et encaisser (cache licence) | Le jeton altéré est rejeté (401) ; en mode avion, la licence en cache valide l'app jusqu'à expiration du cache ; jamais de suppression de données | | NON TESTÉ | |
| TC-LIC-007 | Phases cohérentes avec CGV (seuil 60 j, préavis) | LIC-5 | Moyenne | fonctionnel | Documentation CGV + préprod | 1) Vérifier les dates de phases (impayee_depuis, grace1_at, grace2_at, bloque_at) 2) Comparer aux CGV | Les dates respectent J+30/J+60 ; mise en demeure écrite préalable tracée (procédure documentée) ; conformité test A10 n° 25–26 | | NON TESTÉ | |
| TC-LIC-008 | Bandeau d'information à l'ouverture en grace | LIC-3 | Moyenne | interface | Licence grace1 | 1) Ouvrir le BO et la tablette | Un bandeau informe du délai de grâce, non bloquant, fermez-fonctionnel | | NON TESTÉ | |

---

## 13. Bloc SEC — sécurité, kiosque & exploitation mobile

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-SEC-001 | Mode kiosque : sortie impossible sans code admin | SEC-1 | Critique | sécurité | Tablette provisionnée device-owner | 1) Tenter Home/Récents/retour 2) Saisir le code administrateur | Toute sortie est bloquée sans code ; le code déverrouille ; code paramétrable par le gérant | | NON TESTÉ | |
| TC-SEC-002 | Mise à jour forcée (version minimale) | SEC-2 | Haute | sécurité | Préprod, version_min serveur publiée | 1) Faire pointer une tablette avec version périmée 2) Tenter une sync | La sync est refusée avec message clair invitant à mettre à jour ; les fonctions fiscales locales restent intègres | | NON TESTÉ | |
| TC-SEC-003 | PIN jamais en clair (transport et stockage) | SEC-3, TERM-1 | Critique | base de données | Base préprod + trafic réseau capté | 1) Lire `users_mobile` (pin_hash) 2) Capturer le trafic d'une connexion PIN 3) Inspecter l'APK | PIN stocké hashé (bcrypt/Argon2) ; le PIN ne transite jamais en clair hors TLS ni n'est loggé ; aucun secret dans le bundle client (scan qa-check PASS) | | NON TESTÉ | |
| TC-SEC-004 | Stockage local chiffré (jetons, base sensible) | SEC-3 | Haute | sécurité | Tablette provisionnée | 1) Extraire le stockage local (adb backup / accès fichiers) 2) Chercher jetons et données en clair | Jetons et base locale chiffrés au repos ; aucune donnée exploitable hors app | | NON TESTÉ | |
| TC-SEC-005 | Installation < 10 min (checklist) | SEC-4 | Moyenne | compatibilité | Tablette Android neuve + checklist | 1) Dérouler la procédure documentée pas-à-pas 2) Chronométrer | APK installé + provisioning (poste, imprimante, kiosque) en < 10 min ; checklist coché au complet | | NON TESTÉ | |
| TC-SEC-006 | Sessions mobile verrouillées (inactivité + fermeture) | SEC-5 | Haute | fonctionnel | Session S07 ouverte sur terminal | 1) Attendre le délai d'inactivité paramétrable 2) Forcer la fermeture de l'app | Session verrouillée dans les deux cas ; rouverture exige matricule + PIN ; l'écriture de fermeture de session est journalisée | | NON TESTÉ | |
| TC-SEC-007 | Audit de sécurité automatisé PASS | SEC (BO) | Haute | sécurité | Préprod | 1) `bash scripts/security-audit.sh CaisseFlow` 2) Lire le résultat | 20 PASS / 0 FAIL (gate 0 FAIL obligatoire) ; tout WARN a une décision documentée avec preuve | | NON TESTÉ | |
| TC-SEC-008 | Secrets jamais versionnés | SEC-3 | Critique | base de données | Dépôt git projet | 1) `git ls-files` + grep .env/.key/.pem 2) Inspecter .gitignore | Aucun secret suivi par git ; .gitignore exclut `.env`, `.dev.vars`, clés ; scan `qa-check.sh` 0 FAIL / 0 WARN | | NON TESTÉ | |

---

## 14. Bloc IMP — impression ticket ESC/POS

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-IMP-001 | Modes BT / USB OTG / TCP 9100 / mDNS | IMP-1 | Haute | compatibilité | Imprimantes de test : 1 BT portable, 1 USB OTG, 1 réseau :9100 | 1) Appairer BT 2) Connecter USB OTG 3) Configurer IP:9100 4) Découvrir via mDNS | Les 4 modes impriment un test ; aucune dépendance à un pilote OS ou service d'impression Android | | NON TESTÉ | |
| TC-IMP-002 | Config par poste + test d'impression | IMP-2 | Haute | fonctionnel | Session gérant, /ticket-modele ou écran appareil | 1) Associer imprimante ticket + imprimante cuisine au poste 2) Lancer le test d'impression 3) Remplacer l'appareil et resynchroniser | Deux imprimantes configurées séparément ; test d'impression réussi ; après remplacement d'appareil, la config se réapplique depuis le backend | | NON TESTÉ | |
| TC-IMP-003 | File d'impression persistante (SQLite) | IMP-3 | Haute | fonctionnel | Imprimante hors ligne, 3 encaissements | 1) Encaisser 3 ventes (imprimante débranchée) 2) Rebrancher 3) Vérifier la file | 3 tickets en attente visibles ; au retour de la connexion, les 3 s'impriment dans l'ordre ; la file survit à un redémarrage de l'app | | NON TESTÉ | |
| TC-IMP-004 | Statuts d'impression journalisés et répliqués | IMP-4 | Haute | base de données | Suite de TC-IMP-003 | 1) Consulter le journal (localement + `journal_replica`) | Événements IMPRESSION (envoyé/imprimé/échec/réimprimé) présents des deux côtés, avec utilisateur, motif, horodatage | | NON TESTÉ | |
| TC-IMP-005 | Contenu du ticket conforme (détail) | IMP-5, POS-5 | Critique | interface | Imprimante appairée, vente multi-taux | 1) Encaisser une vente 10 % + 20 % 2) Imprimer 3) Contrôler les mentions | Numéro `POSTE-01-000XXX`, date/heure, nom/adresse/SIRET, détail articles, TVA par taux, total, mode de paiement, matricule caissier, empreinte courte | | NON TESTÉ | |
| TC-IMP-006 | Double ticket client + cuisine, files indépendantes | IMP-6 | Moyenne | fonctionnel | Deux imprimantes appairées | 1) Envoyer une commande 2) Couper uniquement l'imprimante cuisine | Ticket client s'imprime ; le ticket cuisine passe en attente (file indépendante) ; réimprimé au rétablissement sans dupliquer le client | | NON TESTÉ | |
| TC-IMP-007 | Réimpression journalisée, marquée COPIE | POS-5, IMP-4 | Haute | fonctionnel | Ticket déjà imprimé | 1) Réimprimer le ticket 2) Comparer aux originaux 3) Vérifier le journal | La réimpression génère une écriture journalisée (utilisateur, motif, horodatage) ; le ticket porte la mention « COPIE » ; l'original reste la référence journal | | NON TESTÉ | |
| TC-IMP-008 | Découverte mDNS (réseau) | IMP-1, TERM-5 | Basse | compatibilité | Imprimante réseau sur le LAN, mDNS actif | 1) Lancer la découverte depuis l'écran de configuration 2) Sélectionner l'imprimante trouvée | L'imprimante apparaît avec son IP/nom mDNS ; le test d'impression passe après sélection | | NON TESTÉ | |
| TC-IMP-009 | Le ticket n'est pas la source de vérité | IMP-7, FISC-1 | Haute | base de données | Vente imprimée | 1) Perdre volontairement le ticket (corbeille) 2) Vérifier le journal 3) Réimprimer | Le journal contient l'écriture TICKET et le contenu complet ; la réimpression est possible et journalisée ; rien n'est perdu fiscalement | | NON TESTÉ | |
| TC-IMP-010 | Impression sans conditionner l'encaissement (re-check) | IMP-3, NF525 | Critique | fonctionnel | Suite de TC-NF525-015 | 1) Couper l'imprimante cuisine ET client 2) Encaisser 3) Clôturer Z | Encaissement et Z réussissent ; aucune erreur bloquante à l'utilisateur ; les tickets sont en file avec statut échec journalisé | | NON TESTÉ | |

---

## 15. Bloc performance

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PERF-001 | API cloud p95 lecture < 250 ms | SLO ch. 10 | Haute | performance | Préprod, 200 écritures en réplique | 1) Charger les pages de lecture (dashboard, rapports, journal, exports) × 20 2) Mesurer p95 | p95 < 250 ms (harnais : mesures curl `-w '%{time_total}'`) | | NON TESTÉ | |
| TC-PERF-002 | API cloud p95 mutation < 400 ms | SLO ch. 10 | Haute | performance | Préprod | 1) POST/PATCH articles/tables × 20 2) Mesurer p95 | p95 < 400 ms | | NON TESTÉ | |
| TC-PERF-003 | KDS latence LAN < 2 s | SLO ch. 10 | Critique | performance | Terminal + caisse + KDS sur le même LAN | 1) Envoyer une commande 2) Mesurer l'heure d'affichage KDS | Latence commande→affichage < 2 s sur 10 essais | | NON TESTÉ | |
| TC-PERF-004 | Journal de 10 000 écritures : démarrage et contrôle | FISC-2, SYNC-5 | Haute | performance | Copie préprod gonflée à 10 000 écritures | 1) Démarrer l'app caisse 2) Chronométrer contrôle de chaînage 3) Ouvrir le BO /journal paginé | Contrôle complet < 10 s (seuil paramétrable) ; démarrage app < 5 s ; la page /journal reste paginée et utilisable | | NON TESTÉ | |
| TC-PERF-005 | Backlog 1 000 écritures hors ligne : push massif | SYNC-7 | Moyenne | performance | Tablette avec backlog de 1 000 écritures factices | 1) Rétablir le réseau 2) Chronométrer la reprise | Push complet sans perte ni doublon en < 5 min ; UI tablette reste réactive pendant la sync | | NON TESTÉ | |

---

## 16. Bloc compatibilité

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-COMPAT-001 | Responsive BO 360–1920 px | BO (UX) | Haute | interface | Préprod, fenêtres 360 / 768 / 1280 / 1920 px | 1) Ouvrir les 11 pages à chaque largeur 2) Vérifier grilles et tableaux | Aucune page dégradée : grilles passent en 1 colonne mobile, tableaux défilables, aucun bouton hors écran ; mode clair uniquement (règle PRD ch. 15) | | NON TESTÉ | |
| TC-COMPAT-002 | Navigateurs cibles (Chrome/Firefox/Safari) | BO (UX) | Moyenne | compatibilité | Préprod + 3 navigateurs récents | 1) Parcourir login → dashboard → rapports 2) Vérifier styles et comportements | Rendu et comportements identiques ; aucune erreur console bloquante | | NON TESTÉ | |
| TC-COMPAT-003 | Android versions cibles (RN) | SEC, POS | Haute | compatibilité | Émulateurs Android 9 / 12 / 14 | 1) Installer l'APK 2) Se connecter, encaisser, imprimer | Aucune régression de comportement entre versions ; kiosque actif sur toutes | | NON TESTÉ | |
| TC-COMPAT-004 | Imprimantes ESC/POS de la liste cible | IMP-1 | Haute | compatibilité | Xprinter, Star, Epson TM-P, Goojprt | 1) Imprimer le ticket de test sur chaque modèle 2) Comparer le rendu | Encodage et coupe papier corrects sur chaque modèle ; mentions lisibles | | NON TESTÉ | |

---

## 17. Bloc utilisabilité

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-UX-001 | Premier login sans aide (compte démo) | BO (UX) | Moyenne | utilisabilité | Utilisateur fictif novice, page /login | 1) Atteindre l'app via / 2) Se connecter avec les identifiants affichés en démo | L'utilisateur comprend le formulaire et se connecte sans aide ; / rend l'écran de connexion (session active → /dashboard) | | NON TESTÉ | |
| TC-UX-002 | Messages d'erreur compréhensibles | BO (UX) | Haute | utilisabilité | Préprod | 1) Déclencher les erreurs typiques (prix invalide, doublon nom, verrouillage 5 échecs, 403) | Chaque message est en français, précis (ex. « Prix invalide (0–10 000 €) ») et oriente l'action suivante | | NON TESTÉ | |
| TC-UX-003 | Cohérence du design system | BO (UX) | Moyenne | interface | Préprod | 1) Comparer les 11 pages au Design Blueprint (`design/DESIGN-BLUEPRINT.md`) | Palette, typographie, composants (KpiCard, StatusPill, EmptyState, ErrorBanner) conformes ; aucun style hors charter | | NON TESTÉ | |
| TC-UX-004 | Chemin critique caisse sans friction (RN) | POS (UX) | Haute | utilisabilité | Tablette caisse | 1) Chronométrer : ouvrir commande → 3 articles → encaisser → imprimer | Parcours < 60 s sans hésitation majeure pour un serveur formé 10 min ; aucun double clic nécessaire | | NON TESTÉ | |

---

## 18. Bloc participatif — recette pilote (restaurant pilote)

| ID | Titre | Module / Exigence | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-PART-001 | Service réel en conditions d'exploitation | POS, TERM, KDS | Critique | participatif | Restaurant pilote, personnel formé, service du midi | 1) Exploiter l'app sur un service complet (≈ 40 couverts) 2) Noter les incidents temps réel | 100 % des commandes passent par l'app ; incidents bloquants = 0 (ou traités par contournement documenté) | | NON TESTÉ | |
| TC-PART-002 | Clôture de journée avec l'expert-comptable | FISC, BO-5 | Critique | participatif | Fin de journée pilote | 1) Réaliser la Z 2) Générer un export signé 3) Recalculer l'empreinte avec l'expert-comptable | L'expert-comptable valide l'export (empreinte vérifiée) ; aucune anomalie bloquante ; feedback consigné | | NON TESTÉ | |
| TC-PART-003 | Enquête satisfaction + friction | Tous | Moyenne | participatif | Semaine pilote | 1) Enquête questionnaire (serveurs, cuisine, gérant) 2) Synthèse des irritants | Chaque irritant majeur devient un ticket (sévérité à qualifier) ; score satisfaction ≥ 3,5/5 cible | | NON TESTÉ | |

---

## 19. Cas de non-régression issus des retours utilisateur (TC-REG)

> Chaque bug signalé puis corrigé dispose d'au moins un cas de non-régression. Contexte des corrections : commit `69cb0b2` (4 bugs UX) et `c5f404a` (imports/CSRF), `b10ca38` (cycle purge).

| ID | Titre | Bug d'origine | Prio | Type | Préconditions | Étapes | Résultat attendu | Observé | Statut | Bug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-REG-001 | Styles servis par l'app, aucun CDN externe | Page d'accueil non stylée (Tailwind CDN injoignable) | Critique | interface | Préprod, réseau sans accès à cdn.tailwindcss.com | 1) Ouvrir / et /login 2) Vérifier la présence de `/_next/static/css/app/layout.css` 3) Désactiver le CDN volontairement et recharger | Toutes les pages sont stylées sans dépendance CDN ; la feuille de style est servie par l'app (Tailwind compilé via `@tailwindcss/postcss`) | | NON TESTÉ | BUG-001 |
| TC-REG-002 | Styles conservés après « Réessayer » | Après clic « Réessayer » sur le dashboard, page nue | Haute | interface | Suite de TC-REG-001 | 1) Déclencher une bannière d'erreur 2) Cliquer « Réessayer » 3) Vérifier le style après rechargement | La page rechargée reste entièrement stylée (le CSS est un asset local, pas un script CDN injecté après coup) | | NON TESTÉ | BUG-001 |
| TC-REG-003 | Dashboard : KPI chargés avec ventes du jour | « Erreur de chargement des données » (requête TVA : SRF dans agrégat refusée par PostgreSQL) | Critique | fonctionnel | Session gérant, ventes du jour répliquées | 1) Ouvrir /dashboard 2) Chercher la bannière d'erreur 3) Vérifier les 4 KPI | Aucun « Erreur de chargement » ; KPI affichés (ex. « Encaissé aujourd'hui (TTC) » avec la valeur réelle de la réplique, TVA multi-taux) | | NON TESTÉ | BUG-002 |
| TC-REG-004 | Rapports : dates françaises, aucun crash React | « Application error: client-side exception » (objet Date rendu comme enfant React) | Critique | interface | Session gérant, données sur 2 jours | 1) Ouvrir /rapports 2) Vérifier les dates du tableau « Totaux par jour » 3) Aucune erreur console | Dates au format jj/mm/aaaa (ex. 16/11/2026) ; aucune exception console ; « Total période » rendu | | NON TESTÉ | BUG-003 |
| TC-REG-005 | Rapports : filtre de période fonctionnel | Suite du crash /rapports | Haute | fonctionnel | Suite de TC-REG-004 | 1) Filtrer du 01/11 au 30/11 2) Appliquer 3) Vérifier les totaux | Les totaux correspondent à la période filtrée ; le filtre est réappliqué sans crash | | NON TESTÉ | BUG-003 |
| TC-REG-006 | Menu : catégorie visible immédiatement après création | Article créé sans « Catégorie » dans la liste jusqu'à actualisation | Haute | fonctionnel | Session gérant, catégorie « Entrées » | 1) Créer un article avec catégorie via /menu 2) Observer la liste SANS recharger | La ligne affiche la catégorie immédiatement (la réponse POST/PATCH contient `categorie_nom`) ; aucune actualisation manuelle nécessaire | | NON TESTÉ | BUG-004 |
| TC-REG-007 | Déconnexion : 303 vers /login, cookie révoqué | Ancien bug : logout renvoyait du JSON | Haute | fonctionnel | Session valide | 1) POST /api/auth/logout 2) Suivre la redirection 3) Recharger /dashboard | Réponse 303 Location `/login` ; session révoquée ; /dashboard affiche « Session requise » | | NON TESTÉ | BUG-005 |
| TC-REG-008 | POST CRUD articles/tables/users-mobile opérationnels | Routes 500 (profondeur d'imports incorrecte, jamais testées en écriture) | Critique | fonctionnel | Session gérante | 1) POST /api/articles, /api/tables, /api/users-mobile 2) PATCH puis DELETE de chaque création | Trois 201/200 consécutifs, aucune erreur 500 « Module not found » ; versions incrémentées ; audit tracé | | NON TESTÉ | BUG-006 |
| TC-REG-009 | Cycle stop → purge → tests jamais cassé | Purge `.next` pendant un serveur actif (routes-manifest ENOENT, 500) | Haute | base de données | `make check` disponible | 1) Lancer `make check` 2) Observer l'ordre des étapes 3) Vérifier les 11 routes | `make check` = stop (serveurs du projet uniquement) → purge `.next` → harnais 11/11 PASS 200 ; aucun ENOENT | | NON TESTÉ | BUG-007 |
| TC-REG-010 | `make info` : inventaire complet et exact | Demande utilisateur : infos hôte:port, pages, comptes | Basse | interface | Dépôt projet | 1) Exécuter `make info` | Affiche URL, base, pages + RBAC, 4 comptes démo, matricules, jeton appareil, avertissement seed | | NON TESTÉ | BUG-008 |

---

## 20. Couverture et exigences non couvertes

### 20.1 Synthèse de couverture

| Bloc | Nombre de cas | dont bloquants |
| --- | --- | --- |
| NF525 (TC-NF525) | 16 | 16 |
| Offline-first (TC-OFF) | 10 | 10 |
| FISC | 8 | 0 |
| POS | 14 | 0 |
| SYNC | 10 | 0 |
| TERM | 6 | 0 |
| KDS | 6 | 0 |
| BO | 14 | 0 |
| LIC | 8 | 0 |
| SEC | 8 | 0 |
| IMP | 10 | 0 |
| Performance (TC-PERF) | 5 | 0 |
| Compatibilité (TC-COMPAT) | 4 | 0 |
| Utilisabilité (TC-UX) | 4 | 0 |
| Participatif (TC-PART) | 3 | 0 |
| Non-régression (TC-REG) | 10 | 0 |
| **Total** | **136** | **26** |

### 20.2 Exigences partiellement couvertes ou non couvertes (état actuel du livrable)

> **À ce stade, aucune exigence PRD n'est restée sans cas de test** (matrice § 3 : 58/58 exigences tracées). Les limitations sont d'ordre **exécutabilité**, pas de couverture :

1. **Exigences tablette caisse / terminaux / KDS / impression (POS, TERM, KDS, IMP, FISC local, SEC kiosque)** : les cas existent mais restent `NON TESTÉ` tant que les applications React Native ne sont pas implémentées (livrables documentés — PRD ch. 4, phase 2). Exécutable dès leur livraison, sans modification de ce plan.
2. **FISC-6 (clôture mensuelle consolidée)** : cas TC-FISC-005 défini ; l'endpoint cloud de consolidation mensuelle est prévu mais pas encore exposé dans le BO actuel — marquer `BLOQUÉ` si exécuté avant son développement.
3. **LIC-2 (rappels e-mail)** : le canal e-mail nécessite un service SMTP en préprod ; sans lui, TC-LIC-002 est `BLOQUÉ` sur ce canal (les canaux in-app et BO restent testables).
4. **Performance p95 (TC-PERF-001/002)** : mesures significatives uniquement sur un environnement préprod dimensionné, pas sur le poste de dev partagé — exécuter sur préprod dédiée.

### 20.3 Risques de test

- Les tests `TC-NF525-009` (altération) et `TC-OFF-003` (crash) doivent impérativement tourner sur une **copie isolée** de la base ; jamais sur les données réelles de démo (règle append-only).
- Les tests « deux postes » exigent un provisioning POSTE-02 en préprod (seed actuel : POSTE-01 seulement).

---

## 21. Backlog de test — Phase 2 (PRD ch. 14.1/14.2 — implémenté v0.2 : F1 le 2026-11-17, F2 le 2026-11-17)

> Ajouté le 2026-11-17. **F1 et F2 sont désormais implémentés et exécutés** (batteries `tests/backlog-features.js` dans le conteneur, commit F1 `64102ab`, commit F2 `02d1c56`) : **TC-BO1-CAT 13/13 PASS, TC-BO1-PHOTO 12/12 PASS — TOTAL 25/25 PASS**. Les variantes d'implémentation sont notées sous chaque tableau. Les cas marqués `NON TESTÉ` concernent uniquement les surfaces RN (tablettes) non encore implémentées.

### 21.1 TC-BO1-CAT — Gestion des catégories (surface BO)

| ID | Précondition | Action | Attendu |
| --- | --- | --- | --- |
| TC-BO1-CAT-001 | Gérant connecté | POST /api/categories {nom} | `201` ; catégorie visible dans /menu et sync pull |
| TC-BO1-CAT-002 | Gérant | PATCH /api/categories/[id] | `200` ; renommage propagé au prochain sync pull |
| TC-BO1-CAT-003 | Gérant | DELETE catégorie **vide** | `200` ; disparue des listes ; `audit_log` écrit |
| TC-BO1-CAT-004 | Gérant | DELETE catégorie **avec articles** | `400` explicite, rien de supprimé, articles intacts |
| TC-BO1-CAT-005 | Gérant | Archiver catégorie (actif=false) | `200` ; absente des sélections ; historique exports intact |
| TC-BO1-CAT-006 | Comptable / Auditeur | POST ou DELETE catégorie | `403` |
| TC-BO1-CAT-007 | Second (mobile) | lecture via sync | `R` uniquement — pas d'endpoint d'écriture |
| TC-BO1-CAT-008 | Gérant | nom invalide (« A » / 60+ car.) | `400` (DTO `@caisseflow/shared`) |
| TC-BO1-CAT-009 | — | Vérifier aucune écriture journal_replica | Chaînage intact, aucune écriture (FISC non impacté) |

> **Exécution du 2026-11-17** (dans le conteneur, `make test`) : les 9 cas **PASS** + 4 cas complémentaires (**13/13 PASS**) — 008b doublon → `409` ; 002b liste avec compteurs `nb_articles` ; 003b absence après suppression ; 010 trace `audit_log` (≥ 4 écritures). Note 007 : le « lecture via sync » est vérifié par le sync pull (catégories actives uniquement, filtrées `actif=true`).

### 21.2 TC-BO1-PHOTO — Photos des articles (surface BO)

| ID | Précondition | Action | Attendu |
| --- | --- | --- | --- |
| TC-BO1-PHOTO-001 | Gérant | POST photo JPEG/PNG/WebP ≤ 2 Mo | `201` ; `photo_url` renseigné ; vignette 512 px générée |
| TC-BO1-PHOTO-002 | Gérant | POST PDF/GIF renommé .jpg (magic bytes ≠ image) | `400` — validation par magic bytes |
| TC-BO1-PHOTO-003 | Gérant | POST image > 2 Mo ou > 2048 px | `400` — limites explicites |
| TC-BO1-PHOTO-004 | Gérant | Remplacer la photo | ancienne archivée (rétention 30 j), nouvelle servie, ETag différent |
| TC-BO1-PHOTO-005 | Gérant | DELETE la photo | fichier retiré + `photo_url` = NULL + `audit_log` |
| TC-BO1-PHOTO-006 | Comptable / Auditeur / Second | POST/DELETE photo | `403` |
| TC-BO1-PHOTO-007 | Serveur authentifié | GET photo | `200` (vignette/originale) ; **sans session** → `401/403` |
| TC-BO1-PHOTO-008 | Tablette offline | sync pull après upload | photo_url présent, téléchargée au pull, menu utilisable hors ligne |
| TC-BO1-PHOTO-009 | — | Nom de fichier client malveillant (`../../x.php`, `<script>.jpg`) | ignoré — nom UUID serveur, aucune écriture hors du volume uploads |
| TC-BO1-PHOTO-010 | — | Exports fiscaux avant/après suppression photo | identiques (les photos n'entrent pas dans les archives) |

> **Exécution du 2026-11-17** (dans le conteneur, `make test`) : les 10 cas **PASS** + 2 cas complémentaires (**12/12 PASS**). Variantes d'implémentation (décisions F2) : pas de colonne `photo_url` en base — l'URL est **dérivée** `/api/articles/<id>/photo?v=<hash8>` avec `photo_file` (nom UUID sur disque) et `photo_hash` (SHA-256, = ETag) ; **pas de vignette 512 px** générée — l'original (≤ 2048 px, borné à l'upload) est servi tel quel avec cache privé ; PHOTO-007 : sans session **ni** jeton appareil → `403`, avec `Authorization: Bearer <device-token>` → `200` ; PHOTO-008 : le sync pull expose `photo_hash` (la tablette déduit l'URL) ; PHOTO-010 vérifié par invariant : `COUNT(journal_replica)` strictement identique avant/après (22 → 22).

### 21.3 Non-régression associée

- TC-REG-nouveau : après implémentation, rejouer les cas BO existants (articles CRUD, sync pull, exports) + `make smoke` — les migrations 0005 (`actif` catégories) et 0006 (`photo_file`/`photo_hash`, **pas** `photo_url`) doivent rester idempotentes et le chaînage intact. **Exécuté 2026-11-17 : `make smoke` PASS, chaînage SHA-256 vérifié intact (FISC-2 ✓), 25/25 PASS.**

## 22. Activation de licence par clé signée — TC-LIC (PRD ch. 8, implémenté le 2026-11-17)

> Modèle « Office » : clé signée Ed25519 vérifiée **en local** (aucun serveur de licences, coût nul). Décision opérateur : licence expirée/bloquée → **écritures refusées (403)**, consultation/journal/exports fiscaux toujours accessibles (LIC-4).

| ID | Précondition | Action | Attendu | Statut |
| --- | --- | --- | --- | --- |
| TC-LIC-001 | Gérant | POST /api/licence/activate clé valide | `200` ; licences : etat=active, expires_at, plan, cle_id = empreinte | PASS |
| TC-LIC-002 | Gérant | Clé avec signature altérée | `400` « signature refusée », état inchangé | PASS |
| TC-LIC-003 | Gérant | Clé d'un autre restaurant | `400` « autre restaurant » | PASS |
| TC-LIC-004 | Gérant | Clé expirée (exp hier) | `400` « expirée » | PASS |
| TC-LIC-005 | Comptable | POST activate | `403` — seul le gérant | PASS |
| TC-LIC-006 | Gérant | Réactivation (même clé) | `200` — résumé mensuel sans souci | PASS |
| TC-LIC-007 | Licence expirée en base | POST /api/articles | `403` « Licence expirée » | PASS |
| TC-LIC-008 | Licence expirée | POST /api/categories | `403` | PASS |
| TC-LIC-009 | Licence expirée | POST photo | `403` | PASS |
| TC-LIC-010 | Licence expirée | GET /api/categories (lecture) | `200` — lecture et exports jamais verrouillés | PASS |
| TC-LIC-011 | Licence expirée | sync pull (tablette) | `403` — pull suspendu, caisse locale continue hors ligne (SYNC-6) | PASS |
| TC-LIC-012 | Licence restaurée | POST article | `201` — reprise normale | PASS |
| TC-LIC-013 | Après activation | audit_log | traces `licence_activate` | PASS |

**Exécution du 2026-11-17** (dans le conteneur, `make test`) : **TC-LIC 13/13 PASS** — total général **42/42 PASS** (chain-check + TC-BO1-CAT 13 + TC-BO1-PHOTO 12 + TC-UI-MENU 4 + TC-LIC 13), `make smoke` PASS.
