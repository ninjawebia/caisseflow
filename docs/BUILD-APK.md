# Build APK CaisseFlow — guide complet et dépannage

> Tout le build est **conteneurisé** : jamais de `node`, `npm`, `gradle` ni
> `sdkmanager` sur l'hôte (règle du mono-repo). `make` est le seul point d'entrée.

## 1. Procédure standard (5 minutes une fois l'infrastructure chaude)

```bash
cd projects/CaisseFlow

# 1. Bump de version (2 fichiers TOUJOURS ensemble)
#    apps/mobile/app.json       → expo.version + android.versionCode
#    apps/mobile/package.json   → "version" (source du NOM du fichier APK)

# 2. Reconstruire l'image mobile (OBLIGATOIRE : les sources sont COPIÉES dans
#    l'image, il n'y a AUCUN montage de ./apps/mobile)
docker compose build mobile

# 3. Build APK
make build-apk          # ≈ 5 min une fois chaud (NDK + Gradle en cache)

# 4. Vérifier l'APK
ls -la output/apk/
# versionName/versionCode réels dans le manifest :
docker compose run --rm --no-deps mobile sh -c \
  "/opt/android-sdk/build-tools/34.0.0/aapt2 dump badging /outputs/caisseflow-<VER>-release.apk | head -2"
```

Sortie : `output/apk/caisseflow-<version>-release.apk` (bind-mount hôte, UID 1000).

## 2. Chaîne de build (ce qui se passe réellement)

| Étape | Où | Détail |
| --- | --- | --- |
| 1. `expo prebuild --platform android --no-install` | conteneur | génère le projet natif `android/` **éphémère** (jetable avec le conteneur `--rm`) |
| 2. Correctifs Gradle | conteneur | `kotlin = 1.9.24 → 1.9.25` (incohérence catalog RN 0.76 ↔ expo-modules-core, documentée expo) |
| 3. `./gradlew assembleRelease` | conteneur | compile et signe en release ; NDK/SDK depuis le volume `android_sdk`, caches dans `gradle_cache` |
| 4. Copie + chown | hôte | `/outputs/caisseflow-<ver>-release.apk` → `output/apk/` |

## 3. Volumes d'infrastructure (docker-compose, service `mobile`)

| Volume | Rôle | Persistance |
| --- | --- | --- |
| `android_sdk` → `/opt/android-sdk` | SDK + **NDK r26b (~2,5 Go)** + build-tools 34/35 | ⚠️ Ne JAMAIS supprimer (`docker volume rm caisseflow_android_sdk` = re-téléchargement de 15-25 min) |
| `gradle_cache` → `/root/.gradle` | caches Gradle (déps natives, AAPT2…) | accélère fortement les builds suivants |
| `./output/apk` → `/outputs` | artefact final sur l'hôte | oui |

## 4. Problèmes rencontrés lors du build v0.4.0 (2026-11-17) — causes et résolutions

### 4.1 NDK : « Failed to install the following SDK components: ndk;26.1.10909125 »
- **Symptôme** : `make build-apk` échoue pendant `assembleRelease` avec
  `InstallFailedException` sur l'installation du NDK.
- **Cause racine** : le NDK n'est **pas préinstallé dans l'image** (le Dockerfile
  n'installe que cmdline-tools + platforms-35 + build-tools). Gradle le
  télécharge (~650 Mo + décompression ~2,5 Go, **15-25 min**) dans le conteneur
  **éphémère** — trop lent, la session Gradle meurt avant la fin et tout est perdu.
- **Résolution** :
  1. nouveau volume nommé `android_sdk` monté sur `/opt/android-sdk` (le NDK
     s'installe UNE fois et survit au conteneur) ;
  2. installation manuelle idempotente dans le volume :
     `docker compose run --rm --no-deps mobile sh -c "yes | sdkmanager --licenses >/dev/null 2>&1 && sdkmanager 'ndk;26.1.10909125'"` (lancez-la en arrière-plan, elle est lente mais fiable).

### 4.2 Erreur trompeuse : « Could not get unknown property 'release' for SoftwareComponent container »
- **Symptôme** : la sortie Gradle montre une erreur dans
  `ExpoModulesCorePlugin.gradle:95` (`from components.release`) et on croit à un
  problème de plugin expo/AGP.
- **Cause réelle** : erreur **collatérale** — la configuration du projet `:expo`
  dépend de `:expo-modules-core` qui n'a pas pu se configurer à cause du NDK
  (§ 4.1). Le plugin expo n'est pas en cause.
- **Leçon** : lire la **première** erreur du log Gradle (« 1: Task failed »), pas
  la plus visible en bas de sortie.

### 4.3 Build Tools : « Failed to find Build Tools revision 34.0.0 »
- **Cause** : l'image installe build-tools **35.0.0** mais le template RN 0.76.9
  demande **34.0.0**.
- **Résolution** : `sdkmanager 'build-tools;34.0.0'` (dans le volume, persistant)
  + ligne ajoutée au Dockerfile pour les futurs builds :
  `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" "build-tools;34.0.0"`.

### 4.4 APK généré avec l'ancienne version (0.1.0) malgré le bump de app.json
- **Cause double** :
  1. le **nom** du fichier vient de `apps/mobile/package.json` (`version`), pas
     de `app.json` ;
  2. `app.json`/`package.json` sont **copiés dans l'image** (Dockerfile `COPY . .`,
     aucun montage du code mobile) — le conteneur construit donc avec
     l'ancienne version tant que l'image n'est pas rebuildée.
- **Résolution** : bump des **2 fichiers** puis `docker compose build mobile`
  **avant** `make build-apk`. Vérifier dans le conteneur :
  `node -p "require('/repo/apps/mobile/app.json').expo.version"`.
- **Vérification finale** : `aapt2 dump badging` sur l'APK (versionCode/name
  réellement embarqués — le nom du fichier ne prouve rien).

### 4.5 Artefact de recompilation `next dev` (batteries, pas le build APK)
- **Symptôme** : premier `make test` après redémarrage à froid du conteneur web
  → 500 « Unexpected end of JSON input » isolé sur une requête.
- **Cause** : artefact HMR du serveur de **développement** Next (le build de
  production n'est pas concerné).
- **Résolution** : wrapper `fetchR` (1 ré-essai sur 5xx) dans les batteries de
  test + warm-up avant les compteurs.

### 4.6 `Unable to resolve module crypto from …/bcryptjs/umd/index.js` (v0.7.0)

- **Symptôme** : le bundle Android échoue (`createBundleReleaseJsAndAssets`)
  dès que l'authentification PIN (bcryptjs) entre dans l'app.
- **Cause** : bcryptjs 3.x est publié en UMD et `require("crypto")` (module Node).
  Le paquet déclare `browser: { "crypto": false }`, mais Metro ne l'applique pas
  pour la plateforme `android`.
- **Résolution** : `apps/mobile/metro.config.js` mappe `crypto` vers
  `src/shims/crypto.js` (substitut qui **échoue explicitement** si une
  génération de sel était tentée). La tablette ne fait que vérifier des hashs
  (`compareSync`) : le sel est généré par le back-office.
- **Vérification** : `strings` du bundle contient le message de bcryptjs
  (« Neither WebCryptoAPI nor a crypto module is available »), preuve que la
  bibliothèque est bien embarquée.

### 4.7 « Serveur injoignable » alors que le back-office répond (v0.8.1)

- **Symptôme** : à l'enrôlement, l'adresse `http://192.168.x.x:3000` est
  acceptée (validation OK) mais le pull échoue immédiatement — « Serveur
  injoignable — vérifiez l'adresse et le réseau du restaurant », alors que le
  même serveur répond en HTTP 200 depuis un navigateur.
- **Cause** : l'APK est compilé avec `targetSdk 34`. Depuis Android 9,
  `android:usesCleartextTraffic` vaut `false` par défaut : une build **release**
  refuse tout appel HTTP en clair. Le gabarit Expo ne pose cet attribut que sur
  le manifeste de **debug** (vérifiable avec
  `aapt2 dump xmltree --file AndroidManifest.xml`).
- **Résolution** : plugin Expo local `plugins/withCleartextTraffic.js`
  (`withAndroidManifest` → `android:usesCleartextTraffic="true"`), déclaré dans
  `app.json` (`"plugins": ["./plugins/withCleartextTraffic"]`). Il s'exécute à
  chaque `expo prebuild`, donc aucun fichier natif n'est maintenu à la main.
- **Portée** : déploiement local du restaurant (PRD : back-office sur le réseau
  du restaurant). En cas d'exposition Internet, passer le serveur en HTTPS et
  retirer le plugin.
- **Vérification** : `aapt2 dump xmltree` doit afficher
  `usesCleartextTraffic(0x010104ec)=true` sur la balise `<application>`.

## 5. Résumé en une phrase

> Bump de version dans `app.json` **et** `package.json` → `docker compose build
> mobile` → `make build-apk` → vérifier avec `aapt2 dump badging`.

## 6. Historique des versions

| Version | versionCode | Commit | Notes |
| --- | --- | --- | --- |
| 0.1.0 | 1 | `02d1c56` (squelette F2) | premier APK, SDK en image sans volume (NDK re-téléchargé à chaque build) |
| 0.4.0 | 2 | `4835d7a` | volume `android_sdk`, build-tools 34, image rebuildée, docs + SKILL-APK |
| 0.5.0 | 3 | `df29261` | premier APK avec du code réel : socle SQLite (`expo-sqlite`) + Keystore (`expo-secure-store`), enrôlement tablette ; vérifié par `aapt2` et par inspection des libs natives et du bundle |
| 0.6.0 | 4 | `dd7ffaa` | journal fiscal local : triggers append-only, chaînage SHA-256, garde d'horloge, vérification au démarrage ; `expo-crypto` ajouté (UUID + aléa) |
| 0.7.0 | 5 | `a384984` | authentification locale PIN (bcryptjs), cache du personnel, verrouillage de session ; `metro.config.js` mappe `crypto` (absent de RN) vers un substitut explicite |
| 0.8.0 | 6 | `e7fe576` | données de référence locales : migration 4 (catégories, articles en centimes, tables), synchronisation delta des articles, carte locale hors ligne sur l'accueil |
| 0.8.1 | 7 | `99b6d7d` | HTTP en clair autorisé en release (`plugins/withCleartextTraffic.js`) : sans lui, l'APK ne peut pas joindre un back-office local en `http://` |
| 0.9.0 | 8 | `50ddcf0` | prise de commande : plan de salle, panier à prix figés, envoi en cuisine journalisé (VENTE), compléments et occupation des tables |
