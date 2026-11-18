# Socle mobile de la caisse (M1)

> Caisse tablette Android — Expo / React Native 0.76 (SDK 52), 100 % conteneurisé.
> Ce document décrit la structure posée au module M1 ; le journal fiscal (M2),
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
│   │   ├── enrollment.js       enrôlement + contrôle de connexion
│   │   └── migrations.js       inventaire SQL + planificateur (pur)
│   ├── db/index.js             ouverture SQLite, WAL, application des migrations
│   ├── storage/device.js       jeton + adresse dans SecureStore (Keystore)
│   ├── screens/                BootScreen, EnrollmentScreen, HomeScreen
│   └── ui/theme.js             jetons de design (slate/bleu, mode clair)
└── tests/*.test.js             node:test — 34 tests, image node:22-alpine
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

M1 = migration 1 (`settings`). M2 ajoutera le journal fiscal avec ses triggers
append-only dans une migration distincte.

## 5. Tests et build

```bash
make test-mobile     # node --test dans node:22-alpine (aucun node sur l'hôte)
make test            # web (91 tests) + mobile (34 tests)
make build-apk       # APK → output/apk/ (voir docs/BUILD-APK.md)
```

L'APK `0.5.0` (versionCode 3) prouve l'intégration native : `libexpo-sqlite.so`
est présent dans les quatre ABI et le bundle contient le schéma `settings` et
l'appel `/api/sync/pull`.

## 6. Limites assumées du M1

- Navigation minimaliste (2 écrans, machine à états) : la pile d'écrans POS
  arrive avec M5, quand les écrans de commande existent.
- Aucune donnée métier n'est encore stockée localement : le pull M1 sert de
  preuve de jeton. Les tables de référence arrivent en M4, le journal en M2.
- Le jeton est saisi manuellement (pas de QR code) : une tablette par poste,
  installation < 10 min (PRD 4.1.10). Un enrôlement par QR est un candidat
  backlog, non implémenté.
