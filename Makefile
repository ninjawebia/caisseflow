# Makefile — CaisseFlow (pos-nf525)
# Utilisation : make help

APP      := app
PORT     ?= 3000
ROUTES   := /login /dashboard /menu /utilisateurs /tables /rapports /journal /exports /licence /audit /ticket-modele
HARNESS  := ../../scripts/test-local.sh

.DEFAULT_GOAL := help
.PHONY: help install db-up db-down db-reset migrate seed dev check save push commit

help:
	@echo "CaisseFlow — commandes locales"
	@echo "  make install     Installer les dépendances (app/)"
	@echo "  make db-up       Démarrer PostgreSQL (Docker, port 5433)"
	@echo "  make db-down     Arrêter PostgreSQL (données conservées)"
	@echo "  make db-reset    Repartir de zéro (volume supprimé !)"
	@echo "  make migrate     Appliquer les migrations SQL (idempotent)"
	@echo "  make seed        Charger les données de démonstration (JAMAIS en production)"
	@echo "  make dev         Lancer le serveur de développement (http://localhost:$(PORT))"
	@echo "  make check       Tester toutes les routes (PASS 200 attendu)"
	@echo "  make reset       db-reset + migrate + seed (démo neuve)"
	@echo "  make save MSG=\"...\"   Sauvegarder un commit git (un module = un commit)"
	@echo "  make push        Pousser vers GitHub (origin main)"

install:
	cd $(APP) && npm install

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

# Test de toutes les routes : utilise le harnais du skill s'il est présent,
# sinon un serveur temporaire + vérification HTTP de chaque route.
check:
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
