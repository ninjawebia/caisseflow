# Recette fonctionnelle — CaisseFlow

> État au **20/11/2026** : back-office v0.4 + caisse mobile **M0→M5**.
> Ce document décrit ce qui est réellement utilisable aujourd'hui et fournit le
> plan de recette manuelle (tablette + back-office). Les preuves automatisées
> sont dans `TEST-PLAN.md` (§ 21–32) : **255 PASS / 0 FAIL**.

## 1. Ce qui a été développé

### Back-office web (`http://localhost:3000`)

| Domaine | Fonctionnalités livrées |
| --- | --- |
| Authentification | E-mail + mot de passe (bcrypt), sessions courtes révocables, RBAC 4 rôles (gérant, second, comptable, auditeur, admin plateforme), protection CSRF par Origin |
| Dashboard | KPI ventes, TVA multi-taux, activité 7 jours, dernières écritures |
| Menu | Articles (prix HT/TTC, TVA), catégories (créer/renommer/archiver/supprimer), photos (JPEG/PNG/WebP, ≤ 2 Mo, ≤ 2048 px, dédup), bibliothèque média, recherche et tri |
| Utilisateurs | Comptes web et **matricules mobiles** (rôle + PIN 4–6 chiffres, bcrypt), blocage après 5 échecs |
| Tables | CRUD tables et salles |
| Journal NF525 | Journal répliqué append-only, chaînage SHA-256, vérification par poste, sync push idempotente |
| Rapports | Ventes par période, TVA par taux, par serveur, top articles |
| Exports | CSV fiscal avec empreinte SHA-256 en fin de fichier |
| Licence | Activation par clé signée Ed25519, dégradation `active → grace1 → grace2 → bloquee`, écritures refusées (403) mais consultation/exports conservés |
| Audit | Journal d'audit filtrable, lecture seule |
| Ticket | Modèle de ticket 58 mm (logo, mentions) + aperçu |
| Appareils | Création de jetons de tablette (affichés **une seule fois**, stockés hashés SHA-256) |

### Caisse mobile Android (APK 0.9.0, versionCode 8)

| Module | Fonctionnalités livrées |
| --- | --- |
| M0 Enrôlement | Adresse du serveur + jeton d'appareil, validation réelle par un pull, persistance Keystore |
| M1 Socle | SQLite locale migrée, WAL, reprise après crash, accueil d'état |
| M2 Journal fiscal | Journal local append-only, chaînage SHA-256, numérotation `POSTE-01-000001`, triggers anti-UPDATE/DELETE, garde d'horloge, vérification au démarrage |
| M3 Accès opérateur | Connexion **matricule + PIN 100 % locale**, 5 échecs → blocage 5 min, verrouillage après 3 min d'inactivité et 30 s d'arrière-plan |
| M4 Hors ligne | Carte locale (catégories, articles en centimes, TVA, tables, personnel), articles en delta, catégories/tables/personnel en pull complet, licence en cache |
| M5 Commande | Plan de salle, comptoir, panier à prix **figés**, quantités/suppression, totaux TTC + TVA par taux, envoi en cuisine = **VENTE** journalisée, compléments, une seule commande active par table |

### Qualité et sécurité

- Gate sécurité v0.4 : **0 FAIL**, artefacts `security/`.
- QA : `qa-check.sh` 0 FAIL / 0 WARN.
- Automatisé : mobile **135/135**, web **120/120**, soit **255 PASS / 0 FAIL**.
- 100 % conteneurisé : aucun `node`/`npm` sur l'hôte, tout passe par `make`.

### Pas encore livré (ne pas tester comme acquis)

- **M6** : encaissement (espèces/TPE/mixte), calcul du rendu, ticket ESC/POS.
- **M7** : push des écritures mobiles vers le back-office (aujourd'hui les ventes
  mobiles restent dans le journal **local** de la tablette).
- **M8** : clôture Z scellée et signée.
- **M9** : écran cuisine KDS (l'envoi est journalisé, mais aucun écran cuisine).
- **M10** : licence/kiosque sur tablette.
- Transfert de table, annulation d'une ligne déjà envoyée (motif + second),
  variantes/suppléments, QR d'enrôlement.

## 2. Prérequis de recette

1. `make up` puis `make ps` : `web`, `postgres`, `adminer`, `mailhog` **Up**.
2. `make info` : identifiants et adresse LAN.
3. Tablette sur le **même Wi-Fi** ; `http://<IP-LAN>:3000/api/health` → 200.
4. APK `output/apk/caisseflow-0.9.0-release.apk` installé.
5. Un **jeton actif** pour `POSTE-01` : Back-office → **Appareils** → créer et
   copier immédiatement (l'ancien jeton est révoqué).
6. Comptes de démo : web `gerant@local.test / Gerant123!` ; tablette
   `S07 / 3456` (serveur), `MGR / 1234`, `SEC / 2345`, `K01 / 4567`.

> ⚠️ **Le journal local est immuable.** Chaque « Envoyer en cuisine » crée une
> VENTE définitive. Pour repartir d'une tablette propre : désinstaller
> l'application (efface base + journal) puis ré-enrôler.

## 3. Plan de test fonctionnel

Statut à cocher : `OK` / `KO` / `N/A`. Les cas **P0** sont bloquants pour la
recette.

### A. Back-office (navigateur)

| ID | P | Action | Attendu |
| --- | --- | --- | --- |
| BO-01 | P0 | Se connecter avec `gerant@local.test` | Dashboard accessible, KPI affichés, menu latéral complet |
| BO-02 | P0 | Se déconnecter puis ouvrir `/menu` sans session | Redirection vers `/login` |
| BO-03 | P1 | Créer une catégorie « Recette », la renommer, l'archiver | Actions tracées, catégorie absente du pull tablette après archivage |
| BO-04 | P1 | Créer un article « Plat recette » (10,00 € HT, TVA 10 %) avec photo | Article listé, photo affichée, prix TTC calculé |
| BO-05 | P1 | Créer une table « T9 Recette » (salle « Terrasse », 4 places) | Table listée et active |
| BO-06 | P1 | Créer un matricule mobile `TST` / PIN `5678`, rôle serveur | Matricule listé, PIN jamais réaffiché |
| BO-07 | P1 | Ouvrir `/rapports` puis `/exports`, générer un export CSV | Totaux cohérents ; fichier téléchargé ; empreinte SHA-256 en fin de fichier |
| BO-08 | P1 | Ouvrir `/journal` | Chaîne vérifiée, aucune rupture, écritures lisibles |
| BO-09 | P2 | Ouvrir `/audit` | Les créations BO-03..06 y figurent |
| BO-10 | P0 | `/appareils` : créer un jeton `POSTE-01` | Jeton affiché une seule fois, 43 caractères ; ancien révoqué |

### B. Enrôlement et accès tablette

| ID | P | Action | Attendu |
| --- | --- | --- | --- |
| MB-01 | P0 | Installer l'APK 0.9.0, saisir `http://<IP-LAN>:3000` + jeton | Enrôlement accepté, écran de connexion affiché |
| MB-02 | P1 | Ré-enrôler avec un jeton invalide/révoqué | Refus explicite, aucune donnée écrasée |
| MB-03 | P0 | Se connecter `S07 / 3456` | Accueil, nom + matricule affichés |
| MB-04 | P1 | Saisir 5 PIN faux, puis le bon PIN | Blocage 5 min affiché ; bon PIN refusé pendant le blocage |
| MB-05 | P0 | Laisser la tablette inactive 3 min | Verrouillage automatique, retour à l'écran de connexion |
| MB-06 | P1 | Mettre l'app en arrière-plan > 30 s puis revenir | Verrouillage automatique |
| MB-07 | P1 | Bouton « Verrouiller » | Session fermée immédiatement |

### C. Synchronisation et hors ligne

| ID | P | Action | Attendu |
| --- | --- | --- | --- |
| SYNC-01 | P0 | Depuis l'accueil, « Synchroniser » | Compteurs carte (catégories/articles/tables/matricules) et heure de synchro mis à jour |
| SYNC-02 | P1 | Créer/modifier un article au back-office, puis synchroniser | Nouveau prix/nouvel article visible côté tablette |
| SYNC-03 | P0 | Couper le Wi-Fi, ouvrir une commande | Carte et tables disponibles, commande possible |
| SYNC-04 | P1 | Synchroniser hors ligne | Message d'erreur non bloquant, la caisse reste utilisable |
| SYNC-05 | P1 | Vérifier que `TST / 5678` apparaît après synchro | Nouveau serveur connectable localement |

### D. Prise de commande (P0)

| ID | P | Action | Attendu |
| --- | --- | --- | --- |
| POS-01 | P0 | Accueil → « Prendre une commande » | Plan de salle groupé par salle, tables libres/occupées, bouton Comptoir |
| POS-02 | P0 | Ouvrir une table libre, ajouter 2 × un article | Ligne créée, total TTC correct, TVA affichée |
| POS-03 | P0 | Ajouter une 2ᵉ fois le même article au même prix | **Une seule ligne**, quantité 3 |
| POS-04 | P0 | Utiliser −/+, puis supprimer une ligne | Totaux recalculés au centime |
| POS-05 | P0 | « Envoyer en cuisine » | Lignes gelées, mention « Envoyée en cuisine », commande « En cuisine », table toujours occupée |
| POS-06 | P0 | Revenir au plan de salle | Table occupée avec total et opérateur |
| POS-07 | P1 | Rouvrir cette table | Même commande reprise, pas de doublon |
| POS-08 | P0 | Ajouter un article après envoi, puis envoyer | Ligne de **complément** ; 2ᵉ envoi accepté, total commande cumulé |
| POS-09 | P1 | Créer 2 commandes comptoir distinctes | Deux commandes séparées, aucune table associée |
| POS-10 | P0 | Après un envoi, revenir à l'accueil | Compteur d'écritures +1, chaînage **intact** |
| POS-11 | P1 | Modifier le prix de l'article au back-office, synchroniser, rouvrir un brouillon | Les lignes existantes gardent **l'ancien prix** (prix figé) |
| POS-12 | P1 | Ouvrir une table déjà occupée par une commande envoyée | Reprise de la même commande (pas de 2ᵉ commande active) |
| POS-13 | P2 | Bouton « Envoyer » sans ligne | Bouton désactivé, aucun envoi |

### E. Robustesse et persistance

| ID | P | Action | Attendu |
| --- | --- | --- | --- |
| ROB-01 | P0 | Créer un brouillon, quitter l'écran, verrouiller, se reconnecter | Brouillon intact, table toujours occupée |
| ROB-02 | P0 | Tuer l'app (swipe) avec un brouillon, relancer | Brouillon restauré, journal toujours vérifié |
| ROB-03 | P1 | Envoyer une commande puis relancer l'app | Écriture toujours là, chaîne intacte, référence `POSTE-01-00000N` continue |
| ROB-04 | P1 | Synchroniser pendant qu'une commande est ouverte | Le brouillon et les lignes ne sont pas perdus |
| ROB-05 | P1 | Double-toucher « Envoyer en cuisine » | Une seule VENTE (bouton occupé pendant l'envoi) |

## 4. Critères de sortie

La recette est acceptée si :

1. Tous les cas **P0** passent sans crash ni message technique brut.
2. Aucune commande en double sur une même table ; aucun envoi sans ligne.
3. Le chaînage reste **intact** après chaque envoi et après redémarrage.
4. Les totaux TTC et la TVA sont exacts au centime.
5. La caisse reste utilisable **hors ligne** (carte, tables, commande).
6. Les anomalies sont consignées avec : écran, action, résultat attendu,
   résultat observé, capture et heure.

## 5. Limites à ne pas signaler comme bugs (hors périmètre actuel)

- Aucun encaissement ni ticket imprimé (M6).
- Aucun écran cuisine (M9) ; l'envoi est seulement journalisé.
- Les ventes mobiles n'apparaissent pas encore dans `/journal` côté web (M7).
- Pas de clôture Z (M8), pas de licence/kiosque tablette (M10).
- Pas d'annulation d'une ligne déjà envoyée ni de transfert de table.
