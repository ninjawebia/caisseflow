# CaisseFlow — build d'APK React Native/Expo dans un conteneur reproductible.
# PAS DE RUNTIME : l'app tourne sur les tablettes Android — ce conteneur ne sert
# qu'à produire l'APK de manière identique sur n'importe quelle machine.
# Usage : docker compose run --rm mobile ./scripts/build-apk.sh
#        (l'APK atterrit dans ./output/apk monté en volume)
#
# Base Debian (jammy) OBLIGATOIRE : AAPT2 (build-tools Android) est un binaire
# glibc et ne démarre pas sous Alpine/musl (« Daemon startup failed »).
# ⚠ Premier build : téléchargement Android SDK (~3 Go) — 10 à 20 min.
FROM eclipse-temurin:17-jdk-jammy AS base

# Node 22 (Expo CLI / Metro) via le tarball officiel + outils du SDK.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl unzip git ca-certificates xz-utils file \
 && curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz \
      | tar -xJ -C /usr/local --strip-components=1 \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_OPTIONS=--max-old-space-size=4096

# Android SDK (command-line tools) + licences + plateformes/build-tools cibles.
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && \
    curl -sSL -o /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip && \
    unzip -q /tmp/tools.zip -d ${ANDROID_HOME}/cmdline-tools && \
    mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm /tmp/tools.zip && \
    yes | sdkmanager --licenses > /dev/null && \
    sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" "build-tools;34.0.0" > /dev/null

WORKDIR /repo
# Dépendances (pas de lockfile commité → npm install ; réinstallées si
# package.json change — cache de couches Docker).
COPY apps/mobile/package.json /repo/apps/mobile/package.json
RUN cd apps/mobile && npm install --no-audit --no-fund
# Détection mono-repo d'expo (@expo/metro-config) : le bundler stat /repo/node_modules
# (nodeModulesPaths du workspace racine) — le créer vide, la résolution retombe
# sur apps/mobile/node_modules.
RUN mkdir -p /repo/node_modules

COPY . .
USER root
VOLUME ["/outputs"]
WORKDIR /repo/apps/mobile
CMD ["./scripts/build-apk.sh"]
