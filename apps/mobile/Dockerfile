# CaisseFlow — build d'APK React Native/Expo dans un conteneur reproductible.
# PAS DE RUNTIME : l'app tourne sur les tablettes Android — ce conteneur ne sert
# qu'à produire l'APK de manière identique sur n'importe quelle machine.
# Usage : docker compose run --rm mobile ./scripts/build-apk.sh
#        (l'APK atterrit dans ./apps/mobile/outputs monté en volume)
#
# ⚠ Premier build : téléchargement Android SDK (~3 Go) — 10 à 20 min.
FROM eclipse-temurin:17-jdk-alpine AS base

# Node 22 (Expo CLI / Metro) — installé depuis les packages officiels alpine.
RUN apk add --no-cache nodejs npm bash curl unzip git
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
    sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" > /dev/null

WORKDIR /repo
# Dépendances (réinstallées si package-lock change — cache de couches Docker).
COPY apps/mobile/package.json apps/mobile/package.json ./
RUN cd apps/mobile && npm ci --no-audit --no-fund

COPY . .
USER root
VOLUME ["/outputs"]
WORKDIR /repo/apps/mobile
CMD ["./scripts/build-apk.sh"]
