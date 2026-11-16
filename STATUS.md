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
| 4 | Utilisateurs & droits | `/utilisateurs` + `/api/users-*` | `test-local --check --path /utilisateurs` → PASS 200 ; PIN bcrypt, blocage 5 échecs, audit | c661de8 | [x] |
| 5 | Tables & salles | `/tables` + `/api/tables` | `test-local --check --path /tables` → PASS 200 ; CRUD, désactivation tracée | 4ada793 | [x] |
| 6 | Journal NF525 + Sync | `/journal` + `/api/sync/push|pull` + `/api/licence/status` | PASS 200 ; push #1 accepted:1 chainVerified:true ; push #2 (UUID identique) duplicates:1 — idempotence T-SYNC-03 ; push #3 chaînage invalide → rejected:1 chainVerified:false ; sans jeton → 401 | 7439f8b | [x] |
| 7 | Rapports de ventes | `/rapports` | PASS 200 ; login gérant OK (fix import depth + alias hashedpassword) ; total période 510,70 €, TVA par taux, par serveur (S07), top articles rendus | da8a20c | [x] |
| 8 | Exports fiscaux | `/exports` + `/api/exports[/id]` | PASS 200 ; export CSV journal (23 écritures) généré par comptable, empreinte SHA-256 **vérifiée par recalcul** ; admin_plateforme → 403 (RBAC) | ff8d947 | [x] |
| 9 | Licence | `/licence` + `/api/licence` | PASS 200 ; admin → grace2 : device `licence/status` etat:grace2, push → **403** ; gérant PATCH → 403 ; admin → active : push redevenu OK (chainVerified:true) | a3cfbc3 | [x] |
| 10 | Journal d'audit | `/audit` | PASS 200 ; filtre `action=export` → 21 événements export rendus, lecture seule | 1a8eab1 | [x] |
| 11 | Modèle de ticket | `/ticket-modele` + `/api/ticket-template` | PASS 200 ; PATCH gérant OK (logo + mentions persistés) ; comptable/admin → 403 (RBAC correct) | 1e2b952 | [x] |

## Notes

- Reference images: `refs/`
- Design Blueprint: `design/DESIGN-BLUEPRINT.md`
- Security artifacts: `security/`
