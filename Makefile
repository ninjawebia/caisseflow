# Makefile — CaisseFlow (pos-nf525)
# Utilisation : make help
# RÈGLE : après chaque modification de code, purger le cache .next (make clean)
# puis relancer les tests (make check / qa / audit) — le cache dev de Next.js
# peut servir du code périmé et masquer des erreurs.

APP      := app
PORT     ?= 3000
ROUTES   := /login /dashboard /menu /utilisateurs /tables /rapports /journal /exports /licence /audit /ticket-modele
HARNESS  := ../../scripts/test-local.sh

.DEFAULT_GOAL := help
.PHONY: help stop clean install db-up db-down db-reset migrate seed dev check save push commit

help:
	@echo "CaisseFlow — commandes locales"
	@echo "  make install     Installer les dépendances (app/)"
	@echo "  make stop        Arrêter les serveurs dev du projet (ports 3000/4173/4199)"
	@echo "  make clean       Purger le cache .next (après CHAQUE modification, serveurs arrêtés)"
	@echo "  make db-up       Démarrer PostgreSQL (Docker, port 5433)"
	@echo "  make db-down     Arrêter PostgreSQL (données conservées)"
	@echo "  make db-reset    Repartir de zéro (volume supprimé !)"
	@echo "  make migrate     Appliquer les migrations SQL (idempotent)"
	@echo "  make seed        Charger les données de démonstration (JAMAIS en production)"
	@echo "  make dev         Lancer le serveur de développement (http://localhost:$(PORT))"
	@echo "  make check       clean + test de toutes les routes (PASS 200 attendu)"
	@echo "  make reset       db-reset + migrate + seed (démo neuve)"
	@echo "  make save MSG=\"...\"   Sauvegarder un commit git (un module = un commit)"
	@echo "  make push        Pousser vers GitHub (origin main)"

install:
	cd $(APP) && npm install

clean:
	rm -rf $(APP)/.next
	@echo "Cache .next purgé — reconstruit à la prochaine compilation."

# Arrête uniquement les serveurs "next dev" dont le répertoire de travail est
# ce projet (jamais les autres processus du poste).
stop:
	@for p in $$(ss -tlnp 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do \
	  cwd=$$(readlink /proc/$$p/cwd 2>/dev/null); \
	  case "$$cwd" in */pos-nf525/*) \
	    cmd=$$(tr '\0' ' ' < /proc/$$p/cmdline 2>/dev/null); \
	    case "$$cmd" in *next*) echo "arrêt du serveur dev (pid $$p, $$cwd)"; kill $$p;; esac ;; \
	  esac; \
	done; true

db-up:
	cd $(APP) && docker compose up -d db
	@echo "PostgreSQL : localhost:5433 (caisseflow / caisseflow_dev)"

db-down:
	cd $(APP) && docker compose down

db-reset:
	cd $(APP) && docker compose down -v && docker compose up -d db
	@sleep 3

migrate: db-up
	cd $(APP) && npm run db:migrate

seed:
	cd $(APP) && npm run db:seed

dev:
	cd $(APP) && npx next dev -p $(PORT)

reset: db-reset migrate seed
	@echo "Base de démonstration régénérée (22 écritures chaînées, 2 clôtures Z)."

# Test de toutes les routes : ARRÊT des serveurs dev du projet puis PURGE DU
# CACHE (deux serveurs partagent app/.next : purger en fonctionnement casse le
# processus), puis harnais du skill s'il est présent, sinon serveur temporaire
# + vérification HTTP de chaque route.
check: stop clean
	@if [ -f "$(HARNESS)" ]; then \
	  bash $(HARNESS) pos-nf525 --check $(addprefix --path ,$(ROUTES)); \
	else \
	  cd $(APP) && npx next dev -p $(PORT) > /tmp/caisseflow-check.log 2>&1 & pid=$$!; \
	  sleep 8; \
	  ok=0; ko=0; \
	  for r in $(ROUTES); do \
	    code=$$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$(PORT)$$r"); \
	    if [ "$$code" = "200" ] || [ "$$code" = "307" ]; then \
	      echo "PASS: $$r $$code"; ok=$$((ok+1)); \
	    else \
	      echo "FAIL: $$r $$code"; ko=$$((ko+1)); \
	    fi; \
	  done; \
	  kill $$pid 2>/dev/null; \
	  echo "Résultat : $$ok PASS, $$ko FAIL"; \
	  exit $$ko; \
	fi

save:
	@git add -A && git commit -m "$(MSG)" && git log --oneline -1

push:
	git push origin main
