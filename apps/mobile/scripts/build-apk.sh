#!/usr/bin/env bash
# Build APK CaisseFlow DANS le conteneur mobile (aucune commande Android/npm sur l'hôte).
# Sortie : /outputs/caisseflow-<version>-release.apk (volume monté → apps/mobile/outputs).
set -euo pipefail
cd "$(dirname "$0")/.."   # racine du projet mobile (/repo/apps/mobile)

echo "— 1/3 expo prebuild (génération du projet natif android/)"
npx expo prebuild --platform android --no-install

echo "— 2/3 Gradle assembleRelease"
cd android
# Incohérence RN 0.76.x ↔ expo-modules-core : le catalog de versions de
# react-native épingle kotlin = 1.9.24, mais expo-modules-core (Compose 1.5.15)
# exige 1.9.25 — alignement du catalog (correctif documenté expo).
sed -i 's/^kotlin = "1.9.24"/kotlin = "1.9.25"/' ../node_modules/react-native/gradle/libs.versions.toml
grep -q "^kotlinVersion=" gradle.properties || echo "kotlinVersion=1.9.25" >> gradle.properties
./gradlew assembleRelease --no-daemon

echo "— 3/3 copie de l'APK vers output/apk (bind-mount hôte, UID 1000)"
mkdir -p /outputs
APK_SRC="app/build/outputs/apk/release/app-release.apk"
APK_DST="/outputs/caisseflow-$(node -p "require('../package.json').version")-release.apk"
cp "$APK_SRC" "$APK_DST"
# Lisible/modifiable/supprimable par l'utilisateur hôte sans sudo.
chown 1000:1000 "$APK_DST"
echo "APK prêt : $APK_DST"
