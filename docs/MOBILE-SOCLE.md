# Socle mobile de la caisse (M1)

> Caisse tablette Android — Expo / React Native 0.76 (SDK 52), 100 % conteneurisé.
> Ce document décrit la structure posée au module M1, complétée par le journal
> fiscal (M2, voir `docs/JOURNAL-FISCAL.md`) et l'authentification locale (M3) ;
> la prise de commande (M5) et l'encaissement (M6) s'appuient dessus.

## 1. Rôle

| Le socle garantit | Preuve |
| --- | --- |
| La tablette a une **identité** (jeton d'appareil) conservée dans le Keystore Android | `expo-secure-store`, jamais en clair, jamais journalisée |
| La tablette a une **base locale** migrée et durable (WAL, reprise après crash) | `expo-sqlite`, `PRAGMA user_version`, planificateur testé |
| L'enrôlement est **réellement validé par le serveur** (pas une simple saisie) | `POST /api/sync/pull` en `Bearer`, codes 401/403/200 |
| La caisse **démarre même hors ligne** (le journal est local, le cloud est un réplica) | aucune dépendance réseau au démarrage |

## 2. Structure

```text
apps/mobile/
├── App.js                      machine à états : boot → enrôlement | accueil | erreur
├── index.js                    entrée Expo
├── app.json                    nom, version/versionCode, orientation paysage
├── src/
│   ├── core/                   logique PURE (aucun import natif) → testée sous Node
│   │   ├── config.js           normalisation/validation de l'adresse serveur
│   │   ├── token.js            format du jeton (base64url 43), masquage
│   │   ├── version.js          comparaison sémantique (minAppVersion, SEC-2)
│   │   ├── errors.js           codes d'erreur stables + messages utilisateur
│   │   ├── http.js             POST JSON + délai (AbortController), injectable
│   │   ├── enrollment.js       enrôlement, pull de référence, contrôle de connexion
│   │   ├── migrations.js       inventaire SQL + planificateur (pur)
│   │   ├── sha256.js           SHA-256 JS pur (Hermes n'a pas `crypto`)
│   │   ├── hash.js             payload canonique, chaînage, vérification
│   │   ├── journal.js          écritures fiscales, réf. POSTE-XX-…, horloge
│   │   ├── auth.js             politique PIN : 4–6, 5 échecs, 3 min, 30 s
│   │   ├── staff.js            validation du personnel reçu par le pull
│   │   ├── money.js            montants en CENTIMES entiers, format français
│   │   ├── reference.js        validation du pull + carte groupée + date de synchro
│   │   └── uuid.js             UUID v4 à partir d'octets aléatoires injectés
│   ├── db/index.js             ouverture SQLite, WAL, application des migrations
│   ├── db/settings.js          réglages clé/valeur (dernier pull, licence)
│   ├── db/journal-sql.js       SQL du journal (texte + mapping purs, testables)
│   ├── db/journal.js           écriture append-only, garde d'horloge, vérification
│   ├── db/staff-sql.js         SQL personnel + état d'auth + journal des connexions
│   ├── db/auth.js              bcrypt local, échecs/blocage, événements de session
│   ├── db/reference-sql.js     SQL de la carte (UPSERT, désactivation des absents)
│   ├── db/reference.js         sauvegarde transactionnelle, compteurs, menu, tables
│   ├── native/random.js        aléa natif (expo-crypto) injecté dans les modules
│   ├── shims/crypto.js         substitut `crypto` pour bcryptjs (vérification seule)
│   ├── storage/device.js       jeton + adresse dans SecureStore (Keystore)
│   ├── screens/                BootScreen, EnrollmentScreen, LoginScreen, HomeScreen
│   └── ui/theme.js             jetons de design (slate/bleu, mode clair)
├── metro.config.js             mapping `crypto` → src/shims/crypto.js (bcryptjs)
└── tests/*.test.js             node:test — 116 tests, image mobile
                                (dont 30 sur une vraie base SQLite via node:sqlite)
```

Règle de conception : **toute la logique décidable vit dans `src/core/`** (pure),
les écrans et les adaptateurs natifs restent minces. C'est ce qui permet de
tester la caisse sans tablette ni émulateur.

## 3. Enrôlement (parcours complet)

1. Le gérant ouvre **Back-office → Appareils**, saisit `POSTE-01`, obtient un
   jeton affiché **une seule fois** (voir module M0, TEST-PLAN § 25).
2. Sur la tablette : adresse du serveur + jeton → contrôle local du format
   (43 caractères base64url, espaces de copier-coller retirés).
3. L'app appelle `POST /api/sync/pull` avec `Authorization: Bearer <jeton>` :
   - `200` → jeton valide, licence et données de référence reçues ;
   - `401` → jeton révoqué/faux ; `403` → licence expirée/bloquée ;
   - réseau → message explicite, la tablette reste non enrôlée.
4. Succès : adresse **puis** jeton écrits dans le Keystore (cet ordre évite un
   état « enrôlée sans serveur »), base migrée, écran d'accueil.

## 4. Migrations

`src/core/migrations.js` est un tableau ordonné, **append-only** : une migration
livrée n'est jamais réécrite. `PRAGMA user_version` porte le numéro appliqué ;
chaque migration s'exécute dans une transaction (jamais de schéma à moitié
appliqué). Une base écrite par une version plus récente de l'app est **refusée
explicitement** plutôt que rétrogradée.

M1 = migration 1 (`settings`). M2 = migration 2 (`journal` + triggers
append-only + trigger de séquence continue). M3 = migration 3 (`staff`,
`auth_state`, `auth_events`). M4 = migration 4 (`categories`, `articles`,
`tables_resto`).

## 5. Tests et build

```bash
make test-mobile     # node --test dans l'image mobile (aucun node sur l'hôte)
make test            # web (106 tests) + mobile (116 tests)
make build-apk       # APK → output/apk/ (voir docs/BUILD-APK.md)
```

L'APK `0.8.0` (versionCode 6) prouve l'intégration native : `libexpo-sqlite.so`
est présent dans les quatre ABI et le bundle contient les schémas du journal et
de la carte locale (`prix_ttc_cents`, `tables_resto`), l'appel `/api/sync/pull`
et bcryptjs.

## 6. Authentification locale (M3)

- **PIN 4 à 6 chiffres**, vérifié sur l'appareil avec **bcryptjs** (coût 10,
  même format que le back-office). Le PIN ne quitte jamais la tablette et n'est
  jamais journalisé : seul `pin_hash` arrive par le pull.
- **Anti-énumération** : un matricule inconnu est vérifié contre un hash factice
  de coût identique — le temps de réponse ne révèle pas l'existence du compte.
- **5 échecs → blocage 5 minutes**, refus immédiat (sans vérification bcrypt)
  pendant le blocage ; l'état est persisté (`auth_state`) donc il survit à un
  redémarrage de l'app.
- **Verrouillage de session** : 3 minutes d'inactivité (tout contact tactile
  remet le minuteur à zéro) ou retour d'arrière-plan après 30 s. Le bouton
  **Verrouiller** de l'accueil journalise `manual_lock`.
- **Journal des connexions** : `auth_events` (`login_ok`, `login_fail`,
  `lockout`, `manual_lock`, `auto_lock`, `staff_sync`) — **séparé** du journal
  fiscal : une connexion n'est pas un événement fiscal et ne doit pas entrer
  dans le chaînage.
- **Personnel** : cache local alimenté par le pull (dernière version gagnante).
  Un matricule absent du pull est **désactivé**, jamais supprimé.

## 7. Données de référence locales (M4)

- **Contrat** : articles en **delta** (`?since=` = heure SERVEUR du dernier pull
  réussi, stockée dans `last.pull.at` — jamais l'heure locale, qui peut être
  fausse) ; catégories, tables et personnel en pull **complet**.
- **Désactivation des absents** : un identifiant absent d'un pull complet est
  désactivé (`actif = 0`), **jamais supprimé** — une commande passée peut y
  faire référence. Pour les articles (delta), un absent n'est **pas** touché ;
  une désactivation est transmise explicitement.
- **Transaction unique** : toute la carte est écrite dans une transaction, une
  carte à moitié mise à jour serait pire que l'ancienne.
- **Montants en centimes** : `prix_ttc_cents` est un entier (CHECK SQLite) et
  `core/money.js` refuse une valeur absente — un prix manquant ne devient jamais
  un article gratuit. L'affichage (`formatEuros`) n'utilise pas `Intl`.
- **Validation stricte** : UUID, nom tronqué à 80, prix 0..10 000 €, TVA à une
  décimale, places 1..20, version numérique ; une ligne douteuse est rejetée et
  comptée sans interrompre le lot.
- **Hors ligne** : la carte et la licence sont lues depuis SQLite à l'accueil ;
  la synchronisation du démarrage est silencieuse et son échec ne bloque rien.
  L'enrôlement persiste la carte téléchargée sans second appel réseau.

## 8. Décision technique : expo-sqlite (pas WatermelonDB)

Le PRD mentionne WatermelonDB en hypothèse (`[ASSUMPTION]`, décision laissée à
l'agent). **expo-sqlite est retenu** parce que :

1. le journal fiscal exige un **contrôle SQL direct** (triggers append-only,
   `PRAGMA user_version`, vérification complète, payload canonique) — une couche
   ORM/sync intermédiaire masquerait précisément ce qu'un auditeur doit voir ;
2. la synchronisation est **déjà spécifiée** (SYNC-1 : file idempotente,
   UUID d'opération) et implémentée côté serveur ; le moteur de sync de
   WatermelonDB ferait doublon et imposerait son propre modèle ;
3. moins de dépendances natives à lier dans l'APK, base SQLite standard donc
   **extractible et auditable** (exigence fiscale).

## 8 bis. Réseau : HTTP en clair sur le réseau du restaurant

Le back-office est déployé **localement** (`http://<ip-lan>:3000`). Depuis
Android 9 (`targetSdk >= 28`), une build release refuse le HTTP en clair :
`plugins/withCleartextTraffic.js` pose `android:usesCleartextTraffic="true"` sur
le manifeste généré par `expo prebuild`. Sans ce plugin, l'enrôlement échoue
avec « Serveur injoignable » même si le serveur répond. Pour une exposition
Internet, passer en HTTPS et retirer le plugin.

## 9. Limites assumées (M1–M4)

- Navigation minimaliste (2 écrans, machine à états) : la pile d'écrans POS
  arrive avec M5, quand les écrans de commande existent.
- Aucune écriture métier n'est encore branchée : le journal (M2) est un moteur
  vérifié, alimenté par les encaissements M5/M6 avec l'utilisateur authentifié
  de M3. Aucune écriture de démonstration n'est insérée dans un journal fiscal.
- La tablette ne **génère** pas de hash bcrypt (seulement `compareSync`) : le
  changement de PIN se fait depuis le back-office. Le substitut `crypto`
  (`src/shims/crypto.js`) échoue explicitement si une génération était tentée.
- Pas de biométrie ni de QR d'enrôlement : candidats backlog, non implémentés.
- Les photos d'articles ne sont pas téléchargées (seul `photo_hash` est
  conservé) ; les variantes/suppléments et la gestion des salles côté caisse
  restent hors périmètre M4 (candidats backlog).
- Le jeton est saisi manuellement (pas de QR code) : une tablette par poste,
  installation < 10 min (PRD 4.1.10). Un enrôlement par QR est un candidat
  backlog, non implémenté.
