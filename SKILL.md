# SKILL.md — run-caisseflow-test-suite

## Nom

`run-caisseflow-test-suite` — exécuter la suite de tests CaisseFlow et produire un rapport GO/NO-GO.

## Description

Compétence réutilisable : exécuter, dans l'ordre imposé, la suite de tests définie dans `TEST-PLAN.md` (136 cas : 16 bloquants NF525, 10 bloquants offline-first, cas par module FISC/POS/SYNC/TERM/KDS/BO/LIC/SEC/IMP, performance, sécurité, recette participative, non-régression) selon le cycle défini dans `CYCLE-DE-TEST.md`, en suivant les règles d'exécution autonome de `AGENT.md`.

## Quand l'utiliser

- **À chaque release** : smoke test + non-régression (TC-REG + smoke des bloquants exécutables en BO) ;
- **Avant toute mise en production** : recette complète (les 8 phases du cycle, tous les cas exécutables, les 26 bloquants PASS obligatoires) ;
- **Après correction de bug** : cas d'origine + non-régression associée (créer un TC-REG-xxx si le bug provient d'un retour utilisateur).

## Prérequis

- Environnement **préprod démarré** : PostgreSQL Docker `caisseflow-db` (port 5433) + back-office (`make dev`, port 3000) ; `make check` = 11/11 PASS 200 sur un cache purgé ;
- **Données de démo chargées** (`make migrate && make seed` — jamais en production) : comptes `gerant/comptable/auditeur/admin @local.test` (mots de passe dans `make info`), matricules PIN `MGR 1234 / SEC 2345 / S07 3456 / K01 4567`, jeton appareil `device-token-demo-POSTE-01`, journal seed 23 écritures chaînées + 2 clôtures Z ;
- Pour les surfaces mobiles : **tablette Android** (mode kiosque provisionné) et **imprimante ESC/POS appairée** disponibles — sans elles, les cas correspondants sont `BLOQUÉ` (motif consigné) ;
- Compte de test disponible pour chaque profil (4 comptes web + 4 matricules) ;
- Copies isolées de la base prêtes pour les tests destructifs (TC-NF525-009 altération, TC-OFF-003 crash).

## Entrées

- **Version à tester** : commit SHA / tag du dépôt `ninjawebia/caisseflow` ;
- **Périmètre** : `complet` (les 136 cas) | `smoke` (release : `make check` + QA + audit + TC-REG + smoke bloquants) | `non-régression ciblée` (liste d'IDs TC-xxx) ;
- Facultatif : périmètre de surface (BO web seul si les apps RN ne sont pas livrées).

## Étapes

1. **Lire `TEST-PLAN.md`** (conventions § 2, périmètre § 1) et **`CYCLE-DE-TEST.md`** (phase courante, critères d'entrée/sortie) ;
2. **Filtrer les cas** selon le périmètre d'entrée (table de filtrage : IDs demandés) ;
3. **Exécuter dans l'ordre de `AGENT.md`** : (1) NF525 bloquants → (2) offline-first → (3) fonctionnel par module → (4) non-régression → (5) performance/sécurité → (6) recette pilote ; règles strictes applicables (jamais de PASS non vérifié, arrêt immédiat sur FAIL bloquant, jamais toucher au journal fiscal, restauration de l'environnement entre cas) ;
4. **Remplir les statuts** dans les tableaux du TEST-PLAN (Observé + Statut), créer les tickets d'anomalie au format CYCLE-DE-TEST § 6.1 (workflow § 6.2) ;
5. **Produire le rapport** : résumé PASS/FAIL/BLOQUÉ, liste des FAIL avec ID + sévérité + preuve, liste des BLOQUÉ avec prérequis manquants, **recommandation GO / NO-GO** (règles de GO dans AGENT.md).

## Sorties

- `tests/REPORT-<date>-<version>.md` : rapport structuré + recommandation GO/NO-GO ;
- TEST-PLAN.md mis à jour (colonnes Observé/Statut) ;
- Tickets d'anomalie listés (BUG-NNN) avec sévérité et preuves ;
- Sur FAIL bloquant : rapport NO-GO **immédiat** et arrêt de la suite.

## Fichiers liés

| Fichier | Rôle |
| --- | --- |
| `TEST-PLAN.md` | Inventaire des 136 cas de test, matrice de traçabilité PRD (58 exigences), blocs bloquants NF525 + offline |
| `CYCLE-DE-TEST.md` | Stratégie en 8 phases, environnements, critères d'entrée/sortie, cadence, indicateurs, gestion des anomalies, Definition of Done |
| `AGENT.md` | Règles d'exécution autonome pour un agent IA (ordre, strictes, outils, format de rapport) |
| `STATUS.md` | Historique des passes de test déjà réalisées (passe 2 : technique + fonctionnel 4 rôles, `b443e4c`) |
| `security/THREAT-MODEL.md`, `security/REPORT.md` | Contexte sécurité pour les cas TC-SEC-xxx et le gate 0 FAIL |

## Garde-fous

- Jamais sur la production : tests destructifs uniquement en préprod, sur **copies isolées** ; jamais `make seed` en prod ;
- Aucune suppression de données (règle append-only NF525) : les données de test sont désactivées de façon tracée ;
- Gate sécurité obligatoire avant tout GO : `security-audit.sh` exit 0.
