# CYCLE-DE-TEST — CaisseFlow (v1.0 — 2026-11-16)

Processus de test associé à `TEST-PLAN.md`. Exécution autonome : voir `AGENT.md` ; réutilisation : voir `SKILL.md`.

---

## 1. Stratégie (entonnoir en 8 étapes)

| # | Niveau | Contenu | Outils | Automatisation |
| --- | --- | --- | --- | --- |
| 1 | **Tests unitaires** | Fonctions pures : chaînage SHA-256 (`lib/fiscal.js`), validation (prix 0–10 000, taux TVA, matricule), `can()` RBAC, `assertSameOrigin` | Vitest/Node test runner | Oui |
| 2 | **Tests d'intégration** | Endpoints API contre PostgreSQL de préprod : CRUD articles/tables/users-mobile, sync push/pull, exports, licence | curl / harnais `scripts/test-local.sh` | Oui |
| 3 | **Tests fonctionnels manuels** | Parcours métier du TEST-PLAN par module et par surface (cas TC-<MODULE>-xxx) | Navigateur + tablettes | Manuel |
| 4 | **Tests end-to-end** | Parcours complets cross-surfaces : terminal → caisse → KDS → clôture Z → export vérifié | Playwright (BO) + Appium (RN) | Semi-automatisé |
| 5 | **Tests de non-régression** | Bloc TC-REG-001…010 + smoke des blocs bloquants NF525/OFFLINE | Harnais + scripts SQL de chaînage | Oui (partie BO) |
| 6 | **Tests de performance** | TC-PERF-001…005 : p95 API, latence LAN, journal 10 000 écritures, backlog 1 000 | curl chronométré, k6 (optionnel) | Oui |
| 7 | **Tests de sécurité** | TC-SEC-xxx + TC-NF525-009/013 + `security-audit.sh` (gate 0 FAIL) + revue par classe d'attaque (`workflow/06-security-audit.md`) | Scripts + audit manuel | Semi-automatisé |
| 8 | **Recette pilote** | TC-PART-001…003 : exploitation réelle restaurant pilote, validation expert-comptable | Terrain | Manuel |

**Ordre obligatoire** : 1 → 8. Une étape ne démarre pas si les critères d'entrée de la précédente ne sont pas remplis (§ 3).

---

## 2. Environnements

| Environnement | Rôle | Données | Contraintes |
| --- | --- | --- | --- |
| **dev** (`localhost:3000`) | Développement quotidien, `make check` (stop → purge → tests 11 routes) | Seed déterministe, reset fréquent autorisé (`make reset`) | Jamais de test destructif important ici ; serveur peut être relancé à tout instant |
| **préprod** | Exécution de la suite complète, perf, sécurité, recette | **Données de démo déterministes** : PIN 1234/2345/3456/4567 (MGR/SEC/S07/K01), comptes `*@local.test`, jeton `device-token-demo-POSTE-01`, journal 23 écritures chaînées + 2 Z ; POSTE-02 provisionné pour TC-OFF-004 | `make seed` uniquement ici (jamais en prod — NV-1) ; copies isolées obligatoires pour altération (TC-NF525-009) et crash (TC-OFF-003) |
| **prod-pilote** | TC-PART-001…003 uniquement | Données réelles du restaurant pilote | Aucun test automatisé destructif ; observation et journalisation incidents uniquement |

Comptes de test (tous environnements non prod) :

| Profil | Identifiant | Rôle de test |
| --- | --- | --- |
| Gérant | gerant@local.test / Gerant123! | CRUD complet, exports, licence lecture |
| Expert-comptable | comptable@local.test / Compta123! | Rapports, journal, exports |
| Auditeur | auditeur@local.test / Audit123! | Lecture fiscale + audit |
| Admin plateforme | admin@local.test / Admin123! | Licence, audit, admin |
| Matricules | MGR 1234 · SEC 2345 · S07 3456 · K01 4567 | Caisse / second / serveur / cuisine |

---

## 3. Critères d'entrée et de sortie par phase

| Phase | Critères d'entrée | Critères de sortie |
| --- | --- | --- |
| Unitaires | Code compilé, dépendances installées (`make install`) | 100 % des suites unitaires PASS ; aucune régression de couverture sur `lib/fiscal.js`, `lib/auth.js` |
| Intégration | Unitaires sortis OK ; `make db-up && make migrate && make seed` PASS ; `make check` 11/11 | Tous les endpoints répondent conformément aux contrats (§ blocs BO/SYNC) ; 0 FAIL |
| Fonctionnel manuel | Intégration sortis OK ; environnements de test disponibles (tablette, imprimante selon les cas) | Tous les cas du périmètre exécutés ; statuts renseignés ; 0 FAIL Critique/Majeur ouvert |
| End-to-end | Fonctionnel sortis OK ; environnement LAN complet (terminal + caisse + KDS + imprimante) | Parcours critiques PASS (TC-TERM-002, TC-POS-005, TC-IMP-003) |
| Non-régression | À chaque release : suite intégration rejouée | TC-REG-001…010 PASS ; blocs NF525/OFFLINE smoke PASS |
| Performance | Préprod dédiée dimensionnée ; jeu de données gonflé | p95 < 250/400 ms ; latence KDS < 2 s ; seuils TC-PERF respectés |
| Sécurité | `security-audit.sh` disponible ; revue de menace à jour (`security/THREAT-MODEL.md`) | Gate : **0 FAIL** ; tout WARN a une décision documentée avec preuve ; aucun high/critical `confirmed` ouvert |
| Recette pilote | 7 phases précédentes sorties OK ; personnel formé ; GO du comité | TC-PART-001…003 PASS ; 0 incident bloquant |

---

## 4. Cadence

| Moment | Périmètre exécuté |
| --- | --- |
| **Chaque release** (tout commit fusionné sur main) | Smoke test (`make check` 11 routes + `qa-check.sh` + `security-audit.sh`) + non-régression TC-REG + smoke NF525/OFFLINE (les cas exécutables en BO : TC-NF525-004/010/013, TC-OFF-005) |
| **Chaque sprint** | Fonctionnel complet des blocs touchés + e2e des parcours impactés + performance ciblée |
| **Avant mise en production** | Recette complète : les 8 phases dans l'ordre, tous les cas exécutables, gate sécurité 0 FAIL, et les **26 cas bloquants NF525 + offline tous PASS** |

Rappel du cycle obligatoire à chaque modification de code (déjà versionné dans le Makefile et AGENTS.md racine du skill) : **stop des serveurs dev du projet → purge du cache `.next` → tests automatiques → fix → commit**. Un « done » sans sortie de test fraîche n'existe pas.

---

## 5. Indicateurs

| Indicateur | Définition | Cible |
| --- | --- | --- |
| Couverture des exigences PRD | Exigences tracées vers ≥ 1 cas (matrice § 3 du TEST-PLAN) | 100 % (58/58) |
| Taux de réussite | PASS / (PASS + FAIL) sur cas exécutés | ≥ 95 % avant recette pilote ; 100 % sur bloquants |
| Bugs par sévérité | Nombre de tickets Critique / Majeur / Mineur ouverts | 0 Critique ouvert avant release ; 0 Majeur avant prod |
| Délai moyen de correction | Median (date fermeture − date ouverture) par sévérité | Critique < 24 h ; Majeur < 72 h ; Mineur < sprint |
| Taux de régression | Nombre de FAIL dans TC-REG / nombre de releases | ≤ 10 % ; tout FAIL régression = analyse cause racine |
| Exécutabilité | Cas PASS + FAIL sur total (mesure les prérequis manquants) | Suivi de tendance ; `BLOQUÉ` doit diminuer sprint après sprint |

---

## 6. Gestion des anomalies

### 6.1 Format du ticket

```
ID          : BUG-<NNN> (séquence continue, jamais réutilisée)
Titre       : <symptôme observable en une phrase>
Sévérité    : Critique / Majeur / Mineur
Module      : FISC / POS / SYNC / TERM / KDS / BO / LIC / SEC / IMP
Surface     : tablette caisse / terminal / KDS / back-office
Cas liés    : TC-<ID> (du TEST-PLAN)
Étapes      : <reproduction numérotée minimale>
Attendu     : <résultat attendu précis>
Observé     : <résultat réel précis>
Preuve      : capture d'écran / log / réponse HTTP (obligatoire)
Environnement: dev / préprod / prod-pilote + version (commit SHA)
Statut      : voir workflow § 6.2
```

Sévérité :
- **Critique** — perte de conformité NF525, perte de données, écriture altérée, non-fuite rompue (KDS prix), fonction caisse bloquée en service ;
- **Majeur** — fonction obligatoire indisponible ou fausse, contournement impossible ou dangereux ;
- **Mineur** — irritant sans impact fiscal ni bloquage (cosmétique, message confus, lenteur non SLO).

### 6.2 Workflow

```
Nouveau → Confirmé (reproduit, preuve attachée) → En cours → Corrigé → À retester (cas TC-xxx rejoué) → Fermé
                └─ si non reproduit : Reclassé/Rejeté avec preuve
```

- Une correction est liée à son ticket et rejoue **le cas de test d'origine + la non-régression associée** (créer un TC-REG-xxx si le bug vient d'un retour utilisateur).
- Les bugs d'origine utilisateur signalés en session (référence : BUG-001…008 du bloc TC-REG § 19 du TEST-PLAN) conservent leur trace.

### 6.3 Règle de blocage de release

> **Un bug Critique ou Majeur ouvert bloque la release.** Aucune dérogation sur les 26 cas bloquants NF525 + offline-first : un seul FAIL parmi eux = NO-GO, arrêt immédiat de l'exécution (voir AGENT.md).

---

## 7. Definition of Done

La recette n'est terminée que si **tous** ces points sont validés sans anomalie ouverte :

- Checklist **A10 points 1 à 12** (parcours critiques couverts : login/rôles, caisse complète, annulation, clôture, exports…) — PRD ch. 13 ;
- Checklist **A10 points 18 à 21** (sécurité : kiosque, désactivation paiement terminal, secrets, verrouillages) ;
- Checklist **A10 point 27** (conformité fiscale NF525 : journal, chaînage, clôtures, exports) ;
- Les **26 cas bloquants** (16 NF525 + 10 offline-first) : `PASS` ;
- Gate sécurité : `security-audit.sh` exit 0 (0 FAIL) ;
- `make check` : 11/11 PASS sur un cache purgé ;
- Rapport final GO/NO-GO signé (format AGENT.md § rapport).

---

## Annexe — Backlog Phase 2 (2026-11-17)

Les cas **TC-BO1-CAT-001…009** et **TC-BO1-PHOTO-001…010** (`TEST-PLAN.md` § 21) correspondent aux fonctionnalités F1 « catégories » et F2 « photos d'articles » (PRD ch. 14.1/14.2) — **en dehors de l'entonnoir actuel** : ils ne s'exécutent qu'au moment de leur développement (au-dessus du niveau 3 du cycle, avant la non-régression) et ne comptent pas dans le total des 136 cas du livrable v0.1. Rappel transversal : vérifier à chaque exécution que la gestion menu n'écrit **jamais** dans `journal_replica` (TC-BO1-CAT-009, TC-BO1-PHOTO-010).
