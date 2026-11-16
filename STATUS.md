# STATUS — pos-nf525

Stack: `F` — Hybride : backend Next.js + PostgreSQL + Prisma (Docker/Dokploy) + apps React Native (tablette caisse NF525 + terminaux de salle)
Created: 2026-11-16 00:36

## Phases

- [x] Phase 1 — PRD (`prd/PRD-v0.1.md`) — interview A1–A10 complète, PRD approuvé avec amendement module IMP (impression ticket)
- [x] Phase 2 — UI Design (`design/DESIGN-BLUEPRINT.md`) — blueprint 4 surfaces généré, en attente de confirmation avant Phase 3
- [ ] Phase 3 — Code (`app/`)
- [ ] Phase 4 — Local test
- [ ] Phase 4.5 — Security audit (`security/REPORT.md`)
- [ ] Phase 5 — Handoff (`HANDOFF.md`)

## Modules

Build one module, test it, commit it, then start the next one.
Test: `bash scripts/test-local.sh pos-nf525 --check --path <route>`
Commit: `bash scripts/git-save.sh pos-nf525 "<message>"`

| # | Module | Screen / route | Test evidence | Commit | Done |
| --- | --- | --- | --- | --- | --- |
| 1 | Fondations + Auth | `/login` + `/api/auth/login|logout` | `test-local --check --path /login` → PASS 200 ; `/` → 307 ; migrations + seed OK (22 écritures chaînées SHA-256, 2 clôtures Z, 4 comptes web, 4 matricules) | 9252c96 | [x] |
| 2 | Dashboard | `/dashboard` | `test-local --check --path /dashboard` → PASS 200 ; KPI + TVA multi-taux + barres 7 jours + dernières écritures | 675ccc5 | [x] |
| 3 | Menu & TVA | `/menu` + `/api/articles` | `test-local --check --path /menu` → PASS 200 ; CRUD articles avec validation serveur + audit | (M3) | [x] |

## Notes

- Reference images: `refs/`
- Design Blueprint: `design/DESIGN-BLUEPRINT.md`
- Security artifacts: `security/`
