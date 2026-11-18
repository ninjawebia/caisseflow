# Makefile — CaisseFlow (mono-repo conteneurisé)
# RÈGLE ABSOLUE : aucune commande node/npm/npx/yarn/pnpm sur la machine hôte.
# TOUT passe par Docker / Docker Compose. make est le point d'entrée unique.
# Utilisation : make help

COMPOSE   := docker compose
COMPOSE_P := docker compose -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: help up up-all down restart ps logs stop-web clean build shell-web shell-postgres \
        shell-adminer shell-mailhog shell-mobile migrate seed test \
        chain-check healthcheck smoke reset backup restore build-apk fix-perms info push \
        license-keygen license-gen

help:
	@echo "CaisseFlow — commandes (100 % Docker, aucune installation Node requise)"
	@echo "  make up          Démarrer TOUS les conteneurs (web+postgres+adminer+mailhog)"
	@echo "  make down        Arrêter et retirer les conteneurs (données conservées)"
	@echo "  make restart     Redémarrer les services dev"
	@echo "  make ps          État des conteneurs"
	@echo "  make logs        Journaux en direct (web + postgres)"
	@echo "  make shell-web   Shell dans le conteneur web (npm OK — dans le conteneur)"
	@echo "  make shell-postgres  psql direct (conteneur postgres)"
	@echo "  make shell-adminer   Shell conteneur adminer"
	@echo "  make shell-mailhog   Shell conteneur mailhog"
	@echo "  make shell-mobile    Shell conteneur mobile (run --rm — à la demande)"
	@echo "  make migrate     Migrations SQL versionnées (ledger idempotent)"
	@echo "  make seed        Données de démo déterministes (JAMAIS en prod)"
	@echo "  make test        Chaînage NF525 + healthcheck (dans le conteneur)"
	@echo "  make chain-check Vérification du chaînage SHA-256 du journal"
	@echo "  make healthcheck Ping postgres + web depuis l'intérieur du réseau"
	@echo "  make smoke       Test de fumée complet (up/migrate/seed/health/chain)"
	@echo "  make reset       Base de démo NEUVE (volume supprimé !) + migrate + seed"
	@echo "  make backup      pg_dump horodaté + gzip + rotation (14 derniers)"
	@echo "  make restore FILE=caisseflow-YYYYMMDD-HHMMSS.sql.gz"
	@echo "  make up-all      Comme up + conteneur mobile (lance un build APK — long au 1er run)"
	@echo "  make build-apk   Build APK Android dans le conteneur mobile (→ output/apk)"
	@echo "  make fix-perms   Réparer les droits hôte 1000:1000 sans sudo (conteneur jetable)"
	@echo "  make build       Reconstruire les images (après modification du Dockerfile)"
	@echo "  make clean       Supprimer aussi les volumes (node_modules, caches)"
	@echo "  make info        Informations (URL, pages, comptes démo, matricules)"
	@echo "  make push        Pousser vers GitHub (origin main)"

# Démarrage de TOUS les conteneurs persistants : web + postgres + adminer + mailhog.
up:
	@mkdir -p output/apk output/reports output/exports logs
	$(COMPOSE) up -d web postgres adminer mailhog
	@echo "→ web : http://localhost:3000 · adminer : http://localhost:8081 · mailhog : http://localhost:8025"

# Tout, y compris le conteneur mobile (lance un build APK au démarrage —
# premier run long : téléchargement Android SDK ~3 Go, 10–20 min).
up-all:
	@mkdir -p output/apk output/reports output/exports logs
	$(COMPOSE) --profile apk up -d --build
	@echo "→ y compris le conteneur mobile (build APK → output/apk)"

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f web postgres

stop-web:
	$(COMPOSE) stop web
	$(COMPOSE) rm -f web
	@echo "Serveur web dev arrêté (cache .next dans son volume — purge par make clean)."

# Purge des caches de build (web_next_cache = .next du conteneur) et des
# dépendances (apps/web/node_modules = monté dans le conteneur, réinstallé
# au prochain make up par le npm ci du conteneur).
clean:
	$(COMPOSE) down
	$(COMPOSE) volume rm caisseflow_web_next_cache caisseflow_web_node_modules 2>/dev/null || true
	rm -rf apps/web/node_modules
	@echo "Caches purgés — recréés au prochain make up (npm ci dans le conteneur)."

build:
	$(COMPOSE) build

shell-web:
	$(COMPOSE) exec web sh

# Shells interactifs — un par conteneur. Règles : exec pour les services
# résidents, run --rm pour mobile (à la demande), psql direct pour postgres,
# jamais -u root (les conteneurs tournent en non-root ou en leur user dédié).
# (pas de shell-prisma-studio : le socle data est en SQL versionné — Adminer.)
shell-postgres:
	$(COMPOSE) exec postgres psql -U caisseflow -d caisseflow

shell-adminer:
	$(COMPOSE) exec adminer sh

shell-mailhog:
	$(COMPOSE) exec mailhog sh

# Conteneur mobile à la demande (profile apk) : run --rm, le sh REMPLACE le
# build APK (jamais les deux en même temps).
shell-mobile:
	$(COMPOSE) run --rm mobile sh

# Migrations SQL versionnées (dans le conteneur web, ledger schema_migrations).
migrate:
	$(COMPOSE) exec web sh -c "cd /repo/apps/web && node db/migrate.js"

# --- Licences (clés signées Ed25519 — LIC, vérification 100 % locale) ---
# Paire PROPRIÉTAIRE : infra/keys/owner/ (gitignorée — JAMAIS commitée).
license-keygen:
	docker run --rm -v "$$PWD":/repo -w /repo node:22-alpine sh -c "\
	  node -e \"const{generateKeyPairSync}=require('crypto');const{publicKey,privateKey}=generateKeyPairSync('ed25519');\
	  require('fs').mkdirSync('infra/keys/owner',{recursive:true});\
	  require('fs').writeFileSync('infra/keys/owner/public.pem',publicKey.export({type:'spki',format:'pem'}));\
	  require('fs').writeFileSync('infra/keys/owner/private.pem',privateKey.export({type:'pkcs8',format:'pem'}));\" \
	  && chmod 600 infra/keys/owner/private.pem && chmod 644 infra/keys/owner/public.pem"
	@echo "Paire propriétaire créée : infra/keys/owner/{private,public}.pem"
	@echo "→ En production, montez LICENSE_PUBLIC_KEY=infra/keys/owner/public.pem dans l'environnement du conteneur web."

# Paire DEV (préprod/tests uniquement) — idempotente, JAMAIS versionnée
# (gitignorée). Le serveur de dev charge la clé publique depuis le disque
# (Dockerfile stage dev) ; les batteries signent avec la clé privée.
license-devkey:
	@test -f infra/keys/dev/private.pem || docker run --rm -v "$$PWD":/repo -w /repo --user root node:22-alpine sh -c "\
	  node -e \"const{generateKeyPairSync}=require('crypto');const fs=require('fs');\
	  const{publicKey,privateKey}=generateKeyPairSync('ed25519');\
	  fs.mkdirSync('infra/keys/dev',{recursive:true});\
	  fs.writeFileSync('infra/keys/dev/public.pem',publicKey.export({type:'spki',format:'pem'}));\
	  fs.writeFileSync('infra/keys/dev/private.pem',privateKey.export({type:'pkcs8',format:'pem'}));\" \
	  && chown -R `id -u`:`id -g` infra/keys/dev && chmod 600 infra/keys/dev/private.pem && chmod 644 infra/keys/dev/public.pem"
	@echo "Paire DEV prête : infra/keys/dev/{private,public}.pem (gitignorée)"

# Génère une clé de licence pour un client (RID = UUID du restaurant).
license-gen:
	@test -n "$(RID)" || { echo "Usage: make license-gen RID=<UUID restaurant> EXP=AAAA-MM-JJ PLAN=pro"; exit 1; }
	@docker run --rm -v "$$PWD":/repo -w /repo node:22-alpine node apps/web/scripts/license-gen.js \
	  --rid "$(RID)" $(if $(EXP),--exp "$(EXP)",) $(if $(PLAN),--plan "$(PLAN)")

# Seed déterministe — refusé automatiquement si NODE_ENV=production.
seed:
	$(COMPOSE) exec web sh -c "cd /repo/apps/web && node db/seed.js"

# Tests : chaînage NF525 + healthcheck, tout dans les conteneurs.
# Inclut le socle mobile (tests Node purs : aucun node sur l'hôte).
test: license-devkey test-mobile
	$(COMPOSE) exec web sh -c "cd /repo/apps/web && npm test"

# Socle mobile — tests unitaires dans l'image mobile (bcryptjs y est installé).
# Les sources, les tests et App.js sont montés en lecture seule : l'image reste
# la seule à contenir les node_modules (aucun npm/node sur l'hôte).
test-mobile:
	docker compose run --rm --no-deps \
	  -v "$$PWD/apps/mobile/src":/repo/apps/mobile/src:ro \
	  -v "$$PWD/apps/mobile/tests":/repo/apps/mobile/tests:ro \
	  -v "$$PWD/apps/mobile/App.js":/repo/apps/mobile/App.js:ro \
	  mobile sh -c 'cd /repo/apps/mobile && npm test'

chain-check:
	$(COMPOSE) exec postgres /scripts/test-nf525-chain.sh

healthcheck:
	$(COMPOSE) exec postgres /scripts/healthcheck.sh

# Test de fumée : base + migrations + seed + chaînage + HTTP (depuis un conteneur).
smoke: migrate seed chain-check healthcheck
	@$(COMPOSE) exec postgres sh -c "wget -qO- http://web:3000/api/health | grep -q 'ok' && echo 'web HTTP OK (api/health)'"
	@echo "SMOKE TEST : PASS"

# Base de démo neuve (volume PostgreSQL supprimé — dev uniquement !).
reset:
	$(COMPOSE) down -v caisseflow_pgdata
	$(COMPOSE) down
	$(COMPOSE) up -d postgres
	@echo "Attente de PostgreSQL (healthcheck)…"
	@until $(COMPOSE) exec -T postgres pg_isready -U caisseflow -d caisseflow >/dev/null 2>&1; do sleep 1; done
	$(MAKE) migrate seed
	@echo "Base de démo recréée."

backup:
	$(COMPOSE) exec postgres /scripts/db-backup.sh

restore:
	$(COMPOSE) exec postgres /scripts/db-restore.sh

# Build APK Android (service mobile, profile "apk" — jamais démarré avec make up).
build-apk:
	$(COMPOSE) run --rm mobile ./scripts/build-apk.sh
	@echo "APK copié dans output/apk/ (propriétaire UID 1000)."

# Répare les droits hôte (UID 1000) sans sudo — via un conteneur jetable alpine.
fix-perms:
	bash infra/scripts/fix-permissions.sh

info:
	@echo "================ CaisseFlow — POS restaurant conforme NF525 ================"
	@echo "Application : CaisseFlow (mono-repo conteneurisé, v0.1.0)"
	@echo "Web         : http://localhost:3000   (adminer :8081 · mailhog :8025)"
	@echo "Base        : service compose 'postgres' — réseau caisseflow-net (5433 exposé)"
	@echo ""
	@echo "Pages : /login · /dashboard · /menu · /utilisateurs · /tables · /rapports"
	@echo "        /journal · /exports · /ticket-modele · /licence · /audit"
	@echo ""
	@echo "Comptes web : gerant@local.test/Gerant123! · comptable@local.test/Compta123!"
	@echo "              auditeur@local.test/Audit123! · admin@local.test/Admin123!"
	@echo "Matricules  : MGR 1234 · SEC 2345 · S07 3456 · K01 4567"
	@echo "Jeton appareil : device-token-demo-POSTE-01"
	@echo "⚠ Démo uniquement — ne jamais exécuter 'make seed' en production"
	@echo "============================================================================"

push:
	git push origin main --follow-tags
