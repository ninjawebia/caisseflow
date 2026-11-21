# CaisseFlow

POS restaurant conforme NF525 — back-office web + applications tablette (mono-repo).

> **Socle 100 % conteneurisé** : aucune installation Node.js/npm n'est requise sur la machine.
> Tout (dépendances, migrations, seed, tests, build APK) s'exécute dans Docker.

## Démarrage (machine vierge avec Docker Desktop uniquement)

```bash
git clone https://github.com/ninjawebia/caisseflow.git
cd caisseflow
make up        # web + PostgreSQL + adminer + mailhog (réseau caisseflow-net)
make migrate   # migrations SQL versionnées (ledger idempotent, incl. garde-fous NF525)
make seed      # données de démo déterministes (PIN 1234/2345/3456/4567 — JAMAIS en prod)
```

→ Application : **http://localhost:3000** · Adminer : http://localhost:8081 · MailHog : http://localhost:8025

Vérification (depuis les conteneurs, pas depuis l'hôte) : `make smoke`
(base + migrations + seed + chaînage SHA-256 + HTTP `api/health`).

## Arborescence

```
apps/web        → back-office Next.js (BO + API) + lib NF525 (lib/fiscal.js, isolé)
apps/mobile     → caisse Expo React Native (M1 socle, M2 journal fiscal, M3 auth PIN, M4 carte locale, M5 prise de commande ; build APK via Docker)
packages/shared → types NF525 + DTO API partagés (web ↔ mobile)
infra/          → scripts d'exploitation, Caddy (HTTPS), backups, Dokploy, clés de licence
```

## Arborescence et fichiers modifiables

| Chemin (hôte) | Éditable sur l'hôte ? | Justification |
| --- | --- | --- |
| `apps/web/**` (sources), `apps/mobile/**`, `packages/shared/**` | ✅ oui (UID 1000) | Code source bind-monté dans les conteneurs (hot-reload) — vos éditions sont prises en compte sans redémarrage |
| `Dockerfile*`, `docker-compose*.yml`, `Makefile`, `.env*` | ✅ oui | Configurations — jamais générées par les conteneurs |
| `infra/scripts/*.sh`, `infra/caddy/` | ✅ oui | Scripts d'exploitation et config HTTPS |
| `db/migrations/` (SQL versionné) | ✅ oui | Socle data = SQL versionné (pas de Prisma) ; éditées comme du code, appliquées par `make migrate` |
| `apps/web/node_modules/`, `apps/mobile/node_modules/` | ✅ oui (UID 1000) | Dépendances non hoistées (conflit react 19/18) — écrites par les conteneurs à travers le bind-mount ; dérive de droits → `make fix-perms` |
| `output/apk/` | ✅ oui | APK Android généré par le conteneur mobile (bind-mount direct, `chown 1000:1000` automatique) |
| `output/exports/` | ✅ oui | Exports fiscaux signés écrits par `/api/exports` (bind-mount, UID 1000) |
| `output/reports/`, `logs/` | ✅ oui | Rapports de test et journaux applicatifs (bind-mounts) |
| `pgdata` (PostgreSQL) | ❌ volume Docker `caisseflow_pgdata` | **Jamais de bind-mount des fichiers PG** : risque de corruption et de verrous. Accès uniquement via `make migrate`/`seed`/`backup`/`restore` ou Adminer (`:8081`) |
| `.next` (cache Next.js) | ❌ volume Docker `web_next_cache` | Cache de build — performance ; purge par `make clean` si nécessaire |
| `gradle_cache` (Android) | ❌ volume Docker | Plusieurs Go de caches Gradle — aucun besoin d'y accéder ; accélère les builds APK suivants |
| `web_node_modules` (racine du workspace) | ❌ volume Docker | Dépendances hoistées (babel, expo…) — gérées entièrement par le conteneur |

> ⚠️ **Ne jamais éditer manuellement le contenu d'un volume Docker** (données PostgreSQL, caches).
> Utiliser les scripts `db-*` (`make migrate`, `make seed`, `make backup`, `make restore`)
> pour toute opération sur la base. En cas de doute sur un fichier : `make fix-perms`
> rétablit `1000:1000` sur `node_modules`, `output/` et `logs/` sans sudo.

## Choix socle data (décision PRD ch. 9 conservée)

La persistance reste en **PostgreSQL + SQL versionné** (`apps/web/db/migrations/`, ledger
`schema_migrations`), exécuté par `make migrate` dans le conteneur — c'est l'alternative
explicitement prévue pour appliquer les garde-fous NF525 (triggers anti-UPDATE/DELETE sur
`journal_replica` et `clotures`, migration `0003_nf525_guards.sql`). Prisma n'est pas
utilisé ; `prisma-studio` est remplacé par **Adminer**. Toute mutation des DTO passe par
`packages/shared` (une seule définition serveur/client).

## Commandes principales (point d'entrée unique : `make`)

| Commande | Rôle |
| --- | --- |
| `make up` / `make down` / `make logs` | Cycle de vie des conteneurs dev |
| `make migrate` / `make seed` | Base (dans le conteneur web) |
| `make test` | Tests web (117) + tests de la caisse mobile (135) |
| `make test-mobile` | Socle mobile seul (`node --test`, image `node:22-alpine`) — architecture : `docs/MOBILE-SOCLE.md` |
| `make chain-check` / `make healthcheck` | Chaînage NF525 + santé des services |
| `make smoke` | Test de fumée complet |
| `make backup` / `make restore FILE=…` | pg_dump horodaté + rotation (14) |
| `make build-apk` | APK Android reproducible → `output/apk/` (guide complet : `docs/BUILD-APK.md`) |
| `make shell-web` | Shell dans le conteneur (npm autorisé — dedans seulement) |

## Production / préprod (Dokploy ou compose)

```bash
cp .env.example .env.prod     # secrets locaux, jamais commité
docker compose -f docker-compose.prod.yml up -d
```

Image runtime non-root (Alpine, UID 1000), HEALTHCHECK intégré, PostgreSQL non exposé,
Caddy pour HTTPS automatique. Variantes : base conteneurisée (défaut) ou managée
(commenter le service `db`, renseigner `DATABASE_URL`). Portabilité dev → prod par
variables d'environnement uniquement.

## Sécurité

- Licences clients : clés signées **Ed25519** vérifiées **en local** (aucun serveur de licences, coût nul). Clé privée propriétaire via `make license-keygen` → `infra/keys/owner/` (gitignorée, JAMAIS commitée) ; en prod, définir `LICENSE_PUBLIC_KEY`. La paire commitée `infra/keys/dev/` ne vaut que pour la préprod (les clés DEV sont forgables par quiconque a le dépôt — ne pas déployer telle quelle).
- Licence expirée/bloquée : **écritures refusées (403)** (articles, catégories, photos, sync) ; consultation, journal et **exports fiscaux toujours accessibles** (NF525 / LIC-4).
- Photos : validation par magic bytes (jamais le nom/Content-Type client), ≤ 2 Mo, ≤ 2048 px, nom UUID serveur, volume Docker, ancienne photo archivée 30 j, ETag SHA-256.
- Secrets : `.env` local / `.env.prod` / secrets Docker-Dokploy — **jamais commités**.
- Journal fiscal : append-only garanti au niveau PostgreSQL (triggers), chaînage SHA-256
  vérifiable par `make chain-check`, conservation 6 ans, export de contrôle fiscal signé.
- `make seed` refuse de s'exécuter si `NODE_ENV=production` (lead NV-1).

## Crédits

- Protocole d'audit de sécurité adapté de [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT).
- Licence : MIT (voir `LICENSE` à la publication publique).
