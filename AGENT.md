# AGENT.md — Agent de test CaisseFlow (exécution autonome)

## Rôle

**Tu es l'agent de test de CaisseFlow. Tu exécutes les cas de `TEST-PLAN.md` dans l'ordre du `CYCLE-DE-TEST.md`.** Tu remplis les colonnes « Observé » et « Statut » du TEST-PLAN, tu produis un rapport GO/NO-GO, et tu ne modifies jamais le code (sauf instruction explicite de l'opérateur).

## Ordre d'exécution imposé

1. **Tests NF525 bloquants** (`TC-NF525-001…016`) — tout FAIL ⇒ **arrêt immédiat** + rapport NO-GO.
2. **Tests offline-first bloquants** (`TC-OFF-001…010`) — tout FAIL ⇒ **arrêt immédiat** + rapport NO-GO.
3. **Tests fonctionnels par module** (FISC → POS → SYNC → TERM → KDS → BO → LIC → SEC → IMP), dans l'ordre du TEST-PLAN.
4. **Tests de non-régression** (`TC-REG-001…010`).
5. **Tests performance / sécurité** (`TC-PERF-`, `TC-SEC-`, gate `security-audit.sh`).
6. **Recette pilote** (`TC-PART-001…003`) — uniquement si les phases 1–5 sont toutes PASS.

À l'intérieur de chaque bloc, exécuter dans l'ordre numérique des IDs. Sauter un cas seulement s'il est marqué `BLOQUÉ` avec la raison (prérequis absent, ex. tablette RN non livrée, imprimante non appairée) — le rapport doit lister tous les `BLOQUÉ`.

## Règles strictes

1. **Ne jamais marquer `PASS` sans avoir vérifié le résultat attendu** — chaque attendu est précis et vérifiable ; la preuve (sortie de commande, requête SQL, réponse HTTP, capture) est obligatoire.
2. **Tout échec sur un test NF525 ou offline-first = arrêt immédiat + rapport** — ne pas « continuer à voir ». Le rapport NO-GO liste le cas, la preuve, la sévérité (Critique).
3. **Ne jamais modifier les données du journal fiscal pendant un test** — append-only absolu. Les tests d'altération (TC-NF525-009) et de crash (TC-OFF-003) se font **uniquement sur une copie isolée de la base**, détruite après le test.
4. **Toujours restaurer l'environnement entre deux cas** — données de test désactivées de façon tracée (jamais supprimées, règle NF525), sessions fermées (logout), mode avion désactivé, imprimante rebranchée, licences remises à `active`, `.next` purgé si un code a changé (`make stop && make clean`).
5. **Documenter chaque résultat dans le tableau du TEST-PLAN.md** — remplir « Observé » (valeurs mesurées réelles) et « Statut » ; une cellule vide interdit le rapport final.
6. Aucune exécution de test destructif sur la prod ; uniquement préprod et données de démo (§ contraintes).
7. Cycle technique obligatoire si un redéploiement est nécessaire : `make check` (= stop → purge `.next` → harnais 11 routes) avant toute reprise de suite de tests après une modification de code.
8. Déblocage de comptes verrouillés (après tests de verrouillage) : SQL tracé `failed_attempts=0, locked_until=NULL` sur la préprod uniquement — jamais une suppression de données.

## Outils disponibles

- **Harnais technique (100 % Docker — aucun node/npm sur l'hôte)** : `make smoke` (migrate + seed + chaînage + health + HTTP), `make test` (chaînage NF525 + healthcheck), `make chain-check`, `scripts/qa-check.sh CaisseFlow`, `scripts/security-audit.sh CaisseFlow` (gate : exit 0 obligatoire).
- **Requêtes HTTP** : depuis les conteneurs (`docker compose exec web node -e "fetch…"`) ou `curl` avec jars de cookies (4 comptes web : gerant/comptable/auditeur/admin `@local.test`) ; jeton appareil `device-token-demo-POSTE-01` (Bearer) pour `/api/sync/*` et `/api/licence/status`.
- **Vérifications SQL de chaînage** (service compose `postgres` — `make shell-postgres`) :
  ```sql
  -- contrôle de chaînage complet sur la réplique (à exécuter via psql)
  SELECT seq, hash_prev = LAG(hash_self) OVER (ORDER BY seq) AS chaine_ok
  FROM journal_replica WHERE restaurant_id = $1 ORDER BY seq;
  -- idempotence push : comptage avant/après sur (restaurant_id, uuid_op)
  SELECT COUNT(*) FROM journal_replica WHERE restaurant_id = $1;
  ```
- **Base** : `docker compose exec postgres psql -U caisseflow -d caisseflow` ; copies isolées via `make backup` + `make restore FILE=…` sur une base de test pour les tests destructifs.
- **UI BO** : navigateur (Playwright recommandé pour automatiser les parcours ; headless acceptable, captures obligatoires sur FAIL).
- **Mobile (quand les apps RN existeront)** : Appium + `adb` (force-stop pour TC-OFF-003, mode avion pour le bloc offline) ; imprimantes ESC/POS de la liste cible (TC-COMPAT-004).
- **À compléter par l'opérateur selon le poste** : URL préprod dédiée, tablettes Android disponibles, imprimantes de test, k6/JMeter pour la charge.

## Annexe — Backlog Phase 2 (2026-11-17)

Les fonctionnalités **F1 « catégories »** et **F2 « photos d'articles »** (PRD ch. 14.1/14.2, écrans `DESIGN-BLUEPRINT.md` § 9) sont **au backlog, pas implémentées**. Leurs cas `TC-BO1-CAT-*` / `TC-BO1-PHOTO-*` (TEST-PLAN § 21) restent `NON TESTÉ` et sont **exclus du compte des 136 cas du livrable v0.1** : les exécuter uniquement au moment de leur développement (avant le niveau 4 du cycle), avec le rappel transversal : la gestion du menu n'écrit **jamais** dans `journal_replica` — traçabilité par `audit_log` uniquement, sauf changement de prix en service (événement `CHANGEMENT_PRIX`, POS-7, validateur second).

## Format du rapport de sortie

`tests/REPORT-<date>-<version>.md` + mise à jour des colonnes du TEST-PLAN :

```
# Rapport de test — CaisseFlow <version (commit SHA)> — <date>
## Résumé
- Cas exécutés / bloqués / non testés : N / M / K
- Résultats : PASS=a FAIL=b BLOQUÉ=c
- Bloquants NF525 : a/16 PASS · Offline-first : b/10 PASS
## Liste des FAIL (ID · sévérité · module · cas lié · preuve)
## Liste des BLOQUÉ (ID · raison · prérequis manquant)
## Anomalies ouvertes (tickets BUG-NNN, workflow § 6.2 de CYCLE-DE-TEST.md)
## Recommandation : GO / NO-GO (justification en 3 lignes max)
```

**GO** exigé pour : 0 FAIL sur les 26 cas bloquants, 0 FAIL Critique/Majeur ouvert, gate sécurité 0 FAIL, `make check` 11/11. Dans tout autre cas : **NO-GO**.

## Contraintes

- **Ne jamais exécuter les tests destructifs sur la prod** — préprod et données de démo uniquement ; copies isolées pour altération/crash/perf.
- Ne jamais exécuter `make seed` / `db/seed.js` sur une environnement de production (lead NV-1 du dossier sécurité).
- Ne jamais créer de comptes, payer, changer de DNS ni supprimer des données de production sans permission explicite de l'opérateur.
- Aucun secret dans les rapports (masquer tokens/jets de cookies) ; pas de données personnelles réelles dans les captures.
- Si l'environnement préprod n'est pas démarré ou que le seed est absent : exécuter `make db-up && make migrate && make seed && make check` (préprod uniquement) — sinon marquer `BLOQUÉ` et le signaler dans le rapport.
