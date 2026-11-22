# Rapport d'audit de sécurité — CaisseFlow (`CaisseFlow`)

Date : 2026-11-16 · Ré-audit v0.2→v0.4 : **2026-11-17** · Périmètre : `projects/CaisseFlow/app` en local ·
Comptes : fictifs (seed) · Production : jamais contactée.

## 1. Posture

| Élément | Résultat |
| --- | --- |
| Gate statique `security-audit.sh` (ré-audit 2026-11-17) | **20 PASS / 0 FAIL / 0 WARN** |
| Vulnérabilités confirmées ouvertes | **0** |
| Vulnérabilités confirmées **corrigées** | 1 — SEC-003 clé DEV versionnée → rotation + désuivi + chargement disque (2026-11-17) |
| Leads `needs_validation` (faits de déploiement) | 2 (NV-1 seed, NV-2 TLS) — voir `NEEDS-VALIDATION.md` |
| Classe d'attaque | upload de fichiers **désormais applicable** (photos + bibliothèque média) — chassé et rejeté (REJ-009/010/011) |
| Contrôles positifs vérifiés | 6 (voir §3) + validation uploads et gate licence testés par batteries (TC-BO1-PHOTO, TC-MED, TC-LIC) |
| **Révision v0.5 (2026-11-22)** | Uploads portés à **5 Mo / 4096 px** + dérivés WebP (`thumb/card/full`), photos de **catégories**, presets d'image et propagation par le pull. Re-chasse ciblée : `security/THREAT-MODEL.md` § 8 — 6 candidats rejetés avec preuves, **0 confirmé**. Gate statique relancé : **20 PASS / 0 FAIL / 0 WARN** (TC-PRESET 15, TC-CATPHOTO 13, TC-SYNCMG 3, TC-MED 16, TC-BO1-PHOTO 12). |

## 2. Chasse manuelle par classe (workflow/06 §4)

| Classe | Verdict | Preuve / commentaire |
| --- | --- | --- |
| Contrôle d'accès | aucun défaut | isolation tenant vérifiée par reproduction (REJ-002) ; RBAC appliqué dans chaque page/route |
| Auth & session | aucun défaut | verrouillage 5 échecs → 423 vérifié ; révocation après logout vérifiée ; token opaque hashé, régénéré à chaque login (pas de fixation) |
| Injection | aucun défaut | sonde SQL hostile → HTTP 200, table intacte (REJ-001) ; 100 % paramétré |
| Crypto & secrets | aucun défaut | SHA-256 chaînage, bcrypt(10), jetons aléatoires hashés, aucun secret en client (audit statique PASS) |
| Logique métier | aucun défaut | idempotence push (module 6), numérotation continue contrôlée, dégradation de licence sans blocage fiscal (LIC-4) |
| Fichiers & SSRF | aucun défaut | traversée de chemin impossible sur les exports (REJ-007) ; aucun champ URL côté serveur (pas de SSRF) |
| Client | aucun défaut | aucun `dangerouslySetInnerHTML`, pas de postMessage ; CSP en durcissement (voir §4) |
| Isolation & cycle de vie | aucun défaut | chaque requête scoppée `restaurant_id` ; append-only fiscal et audit |
| Disponibilité & abus | durcissement | verrouillage durable sur login ; limiteur mémoire + endpoints authentifiés sans quota (§4) |
| Chaîne d'approvisionnement | aucun défaut | dépendances minimales épinglées, `next@15.5.29` corrigé de la CVE connue ; `npm audit --deps` à relancer au moment du déploiement |
| Redirection | aucun défaut | logout : cible constante `/login`, base `APP_ORIGIN` hors requête ; `?next=https://evil.example` ignoré (REJ-008) |
| **Ré-audit v0.2→v0.4 (2026-11-17)** | | |
| Upload de fichiers (photos + média) | aucun défaut | magic bytes jamais le nom/Content-Type client, ≤ 2 Mo, ≤ 2048 px, UUID serveur, type re-détecté au servage + `nosniff` (REJ-011 ; batteries TC-BO1-PHOTO 12/12, TC-MED 16/16). **v0.5 : limites portées à 5 Mo / 4096 px, dérivés WebP seuls exposés — re-testé par TC-CATPHOTO/TC-SYNCMG, même verdict.** |
| Traversée de chemin média | aucun défaut | `file` jamais alimenté par la requête client (UUID serveur), `pathOf` uniquement avec des valeurs de base (REJ-009) |
| IDOR média cross-tenant | aucun défaut | scoping `restaurant_id` (session) sur les 3 routes média ; 404 sur identifiant étranger (REJ-010) |
| Clés de licence | **1 confirmé corrigé** | paire DEV versionnée dans l'historique git (SEC-003) → rotation, désuivi, clé publique chargée du disque ; prod = LICENSE_PUBLIC_KEY (paire owner) |
| Gate licence sur écritures | aucun défaut | `licenceGate()` sur 8 endpoints + sync pull ; lecture/journal/exports jamais verrouillés (LIC-4) — TC-LIC 13/13 |

## 3. Contrôles positifs vérifiés (preuves locales bornées)

1. **Append-only en base** : UPDATE/DELETE sur `journal_replica` et `audit_log` → 0 ligne (`evidence/append-only-control.txt`).
2. **Idempotence de réplication** : renvoi du même UUID → `duplicates:1` ; chaînage invalide → rejet (`chainVerified:false`) ; sans jeton → 401 (STATUS.md module 6).
3. **Verrouillage brute force** : 5 échecs → 423, même avec le bon mot de passe (`evidence/lockout.txt`).
4. **Révocation de session** : cookie inutilisable après logout (`evidence/session-revocation.txt`).
5. **Isolation multi-tenant** : export d'un tenant B fictif inaccessible depuis A → 404 (`evidence/tenant-isolation.txt`).
6. **Empreinte d'export vérifiable** : re-calcul SHA-256 du CSV = empreinte enregistrée (STATUS.md module 8).

## 4. Décisions sur les points de durcissement (acceptés, non-bloquants)

| Point | Décision | Justification |
| --- | --- | --- |
| Limiteur mémoire mono-instance | Accepté pour le pilote | le verrouillage DB par compte (durable) plafonne l'impact ; limiteur partagé recommandé avant montée en charge |
| Pas de quota sur `/api/sync/*`, `/api/exports` | Accepté | endpoints authentifiés par jeton/mdp ; à réévaluer si exposition publique directe |
| CDN Tailwind dans le layout | Accepté pour la démonstration | à remplacer par un bundle local + CSP stricte avant production (recommandation, pas un défaut atteignable) |
| TOTP désactivé par défaut | Accepté | fonctionnel et prêt ; activation recommandée pour les rôles comptable/auditeur/admin |
| Pas de quota par tenant sur `/api/media` / photos | Accepté pour le pilote | plafond par fichier (5 Mo/4096 px depuis v0.5, dérivés WebP bornés) + dédup par hash + écriture réservée au gérant (personnel interne, hors modèle de menace) ; à réévaluer si exposition externe |
| Paire DEV de licence jamais versionnée | **Décision appliquée (2026-11-17)** | SEC-003 : rotation de la paire, `git rm --cached` + `.gitignore`, génération idempotente `make license-devkey`, serveur de dev charge la clé publique du disque ; l'ancienne clé (historique git) est réputée compromise et ne signe plus rien d'accepté |
| Jetons de démonstration prévisibles | non-bloquant, conditionné au déploiement | traité en NV-1 (le seed ne doit jamais courir en production) |

## 5. Limites de couverture

- Les applications React Native (tablette caisse, terminaux, KDS) sont des
  livrables documentés du PRD : le stockage sécurisé du PIN (Keystore/Keychain)
  et le mode hors-ligne 3 jours n'ont pas pu être exécutés dans cet
  environnement ; leur contrat est couvert par `/api/sync/*` (testé).
- Les faits de déploiement (TLS, proxy, sauvegardes, multi-instance) sont
  renvoyés en `needs_validation` avec des vérifications non destructives.
- Un seul tenant réel + un tenant fictif temporaire créé pour le test puis
  supprimé ; le cloisonnement a été vérifié sur les endpoints de données.

## 6. Conclusion du gate

`security-audit.sh` : **0 FAIL** (ré-audit v0.2→v0.4 du 2026-11-17 : 20 PASS /
0 WARN) — tous les WARN ont une décision tracée, `THREAT-MODEL.md`,
`REPORT.md` et `findings.json` concordent, aucun `confirmed` high/critical
ouvert. Le seul confirmé (SEC-003, Low) est **corrigé** : rotation de la paire
DEV, désuivi git, chargement de la clé publique depuis le disque, régression
TC-LIC 13/13 PASS. **Le gate de la Phase 4.5 est franchi pour v0.4.**
