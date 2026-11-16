#!/usr/bin/env bash
# Build APK CaisseFlow DANS le conteneur mobile (aucune commande Android/npm sur l'hôte).
# Sortie : /outputs/caisseflow-<version>-release.apk (volume monté → apps/mobile/outputs).
set -euo pipefail
cd "$(dirname "$0")"

echo "— 1/3 expo prebuild (génération du projet natif android/)"
npx expo prebuild --platform android --no-install

echo "— 2/3 Gradle assembleRelease"
cd android
./gradlew assembleRelease --no-daemon

echo "— 3/3 copie de l'APK vers le volume /outputs"
mkdir -p /outputs
APK_SRC="app/build/outputs/apk/release/app-release.apk"
APK_DST="/outputs/caisseflow-$(node -p "require('../package.json').version")-release.apk"
cp "$APK_SRC" "$APK_DST"
echo "APK prêt : $APK_DST"
