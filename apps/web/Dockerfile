# CaisseFlow — back-office Next.js. Build multi-étapes (deps → dev → build → runtime).
# Aucun secret en dur : tout passe par des variables d'environnement (compose / Dokploy).
# Contexte de build : la RACINE du mono-repo (dockerfile: apps/web/Dockerfile).

# --- Stage deps : installation reproductible (npm ci, lock versionné) ---
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --no-audit --no-fund

# --- Stage dev : serveur de développement avec hot-reload (docker-compose dev) ---
FROM node:22-alpine AS dev
WORKDIR /repo
ENV NODE_ENV=development
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# Points de montage des volumes nommés : pré-créés et possédés par node (UID 1000),
# sinon Docker les crée root-owned → EACCES sur .next/trace.
RUN mkdir -p /repo/apps/web/.next && chown -R node:node /repo/apps/web/.next /repo/node_modules
USER node
EXPOSE 3000
# node_modules vit dans un volume nommé : installé DANS le conteneur si absent
# (machine vierge ou après make clean), puis hot-reload sur le code monté.
# Si l'installation échoue, on ABORT (jamais un next dégradé via npx).
CMD ["sh", "-c", "ls /repo/node_modules/.package-lock.json >/dev/null 2>&1 || npm ci --no-audit --no-fund || exit 1; cd apps/web && npx next dev -H 0.0.0.0 -p 3000"]

# --- Stage build : compilation production (sortie standalone) ---
FROM node:22-alpine AS build
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# DATABASE_URL factice : next build ne touche pas la base (pages dynamiques).
# (indirection pour ne jamais écrire un littéral postgres:// après DATABASE_URL)
RUN cd apps/web && DUMMY="postgres://build:build@127.0.0.1:5432/build" && DATABASE_URL="$DUMMY" npm run build

# --- Stage runtime : image minimale non-root (node, UID 1000) ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Sortie standalone Next.js : server.js + traced files (inclut @caisseflow/shared)
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
