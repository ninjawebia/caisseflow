# PRODUCT REQUIREMENTS DOCUMENT — CaisseFlow

**STATUS: Approved — Base for V1 Development (amendment IMP integrated)**

| Metadata Item | Specification |
| --- | --- |
| **Product Name** | CaisseFlow — Système d'encaissement restaurant conforme NF525 |
| **Document Version** | v0.1 (Provisional Draft) |
| **Prepared by** | Agent IA (Product Manager / Solution Architect) |
| **For / Stakeholder** | Client CaisseFlow (1 restaurant pilote année 1) |
| **Date** | 2026-11-16 |
| **Project Folder** | `projects/CaisseFlow/` |
| **Target Technology** | Hybride (F) : Backend Next.js + PostgreSQL + Prisma (Docker/VPS) + Applications React Native (tablette caisse + terminaux) |
| **Related Documents** | `DESIGN-BLUEPRINT.md`, `STATUS.md`, `THREAT-MODEL.md` |

---

## 1. Product Summary & Strategic Alignment

### 1.1 Problem Statement & Background

L'encaissement est aujourd'hui un point de friction et de risque pour les restaurants français. Depuis le 1er janvier 2018, l'article 286 I-3° du CGI impose à tout assujetti acceptant les paiements de ses clients d'utiliser un **système de caisse conforme** : les données d'encaissement doivent satisfaire les quatre critères **ISCA** — Inaltérabilité, Sécurisation, Conservation, Archivage (norme NF525). Un poste non conforme expose l'exploitant à une **amende de 7 500 € par caisse non conforme**, et une carence en cas de contrôle fiscal peut aller jusqu'à la reconstitution de recettes (redressement forfaitaire).

Les exigences opérationnelles réelles du terrain aggravent ce cadre : un service de restaurant ne tolère **aucune coupure d'encaissement** (panne internet, coupure électrique brève, Wi-Fi saturé), les serveurs encaissent debout et sous pression, toute annulation/remise/changement de prix doit être tracé nominativement, et l'expert-comptable comme le contrôle fiscal doivent pouvoir **exporter et reconstituer** l'intégralité des opérations.

Aucune solution généraliste actuelle ne combine à la fois : un journal fiscal **calculé et scellé localement sur le poste de caisse** (la conformité ne dépend jamais du réseau), un fonctionnement **100 % hors ligne de plusieurs jours**, une séparation technique stricte entre postes de caisse (seuls habilités à encaisser) et terminaux de saisie, et une dégradation progressive gérée en cas d'impayé d'abonnement sans jamais toucher aux données fiscales.

### 1.2 Solution Overview & Core Value Proposition

**CaisseFlow** est une suite d'encaissement composée de deux applications :

1. **Backend cloud (Next.js + PostgreSQL + Prisma, conteneurisé Docker sur VPS/Dokploy)** — back-office web (menu, prix, utilisateurs, droits, rapports, exports) + API consommée par les applications mobiles. Source de vérité pour l'**archivage fiscal long terme (≥ 6 ans)**, les clôtures consolidées (Z journalières, mensuelles, annuelles) et les exports pour contrôle fiscal. La logique métier NF525 est isolée dans un **module dédié**, séparé des routes, pour rester extraite si le projet grossit.
2. **Application mobile React Native** en deux variantes :
   - **Tablette « caisse » (rôle gérant/second)** — le **seul poste de caisse au sens NF525**. Base locale SQLite (source de vérité du journal fiscal), **Journal Permanent append-only** avec chaînage SHA-256 et numérotation continue préfixée par poste (`POSTE-01-…`), horloge non reculable, clôtures locales signées, file de synchronisation idempotente, fonctionnement **100 % hors ligne**.
   - **Terminaux « serveurs »** — appareils de prise de commande uniquement, connectés à la tablette caisse en réseau local, **paiement techniquement désactivé** (pas seulement masqué), aucun journal fiscal propre.

Valeur centrale : **un seul poste fiscal, inaltérable, indépendant du réseau** — encaisser sans internet pendant des jours avec des tickets parfaitement conformes, annuler uniquement sous double validation, et répondre à un contrôle fiscal en un export.

### 1.3 Target Audience & Primary Use Cases

- **Restaurant pilote (année 1)** : service à table + comptoir/à emporter, ~150–350 tickets/jour, 1 tablette caisse + 2–3 terminaux de prise de commande.
- **Cas d'usage primaires** :
  1. Service à table : commande table → cuisine → encaissement → ticket → journal fiscal.
  2. Comptoir/emporter : saisie directe → encaissement → ticket → journal fiscal.
  3. Clôture de journée Z : scellé signé local → réplication → archivage PDP.
  4. Annulation/remise : motif + matricule + PIN + validation du second → **nouvelle** écriture du journal.
  5. Back-office gérant : menu, prix, utilisateurs, droits, rapports de ventes.
  6. Expert-comptable / contrôleur fiscal : export complet du journal et des archives, reconstitution des opérations.
- Les **clients finaux** du restaurant (commande par QR code) sont une capacité **Phase 2** (voir 4.3) ; en v0.1 les terminaux sont réservés aux serveurs.

### 1.4 North Star Metric & Measurable Success Indicators

- **North Star Metric:** nombre de tickets encaissés avec journal conforme et synchronisé (cible : 100 % des tickets, zéro exception).
- **Efficiency Metric:** temps d'encaissement ≤ 30 s du premier contact à l'écran au ticket imprimé (scénario comptoir, panier de 5 articles).
- **Accuracy Metric:** 0 divergence entre journal local et réplique cloud après synchronisation (contrôle de chaînage SHA-256 systématique côté serveur).
- **Adoption Target:** 1 restaurant pilote 100 % opérationnel sur CaisseFlow en service réel (critère terrain A10), puis 3–5 restaurants en année 2.
- **Conformity Metric:** 0 écriture de journal modifiable ou supprimable par aucune interface ; 100 % des clôtures Z scellées et exportables.

---

## 2. Goals & Objectives

### 2.1 Business Objectives
- Offrir une alternative conforme NF525, juridiquement défendable (journal local, clôtures signées, archives 6 ans), à prix maîtrisé (VPS, pas de PaaS propriétaire).
- Protéger le chiffre d'affaires de l'éditeur via un modèle d'abonnement par restaurant avec **dégradation progressive** en cas d'impayé, conforme aux obligations de conservation des données.
- Permettre l'extension multi-restaurants (année 2) sans refonte du socle.

### 2.2 User Experience Objectives
- Interface caisse utilisable **à une main, debout, avec gants** : cibles tactiles ≥ 64 px sur la tablette caisse, flux encaissement en ≤ 3 écrans.
- Zéro formation complexe : connexion par matricule + PIN, prise de commande en 2 taps par article.
- Lisibilité instantanée de l'état cuisine (KDS) sans accès aux prix pour les commis.

### 2.3 Technical & Operational Objectives
- La **conformité fiscale ne dépend jamais du réseau** : journal calculé, scellé et conservé localement ; le cloud n'est qu'archivage.
- Aucune écriture du journal n'est modifiable ou supprimable, ni côté local, ni côté cloud (append-only strict, contrôle de chaînage systématique).
- Déploiement conteneurisé identique dev → préprod → prod (docker-compose / manifestes Dokploy), rollback en une commande.
- Maintenance interne automatisée : sauvegardes quotidiennes + rétention fiscale 6 ans + tests de restauration réguliers, supervision logs/alertes, fenêtres de maintenance hors heures de service.

---

## 3. Users, Personas & Role-Based Access Control (RBAC)

### 3.1 User Personas

- **Gérant (tablette caisse + back-office)** : propriétaire du restaurant. Gère le menu, les prix, les utilisateurs, les droits, les rapports, les clôtures. Technologie : tablette Android pendant le service, navigateur le reste du temps. Littératie technique moyenne.
- **Second / Responsable de salle (tablette caisse)** : valide les opérations sensibles (annulation, remise, correction) en saisissant son propre matricule + PIN sur l'écran. Peut encaisser.
- **Serveur (terminaux de salle)** : prend les commandes, transmet à la caisse. **Ne peut pas encaisser** — la fonction paiement est techniquement désactivée sur son terminal. Connexion matricule + PIN.
- **Commis de cuisine (écran KDS)** : reçoit et traite les tickets de préparation. Profil restreint : **aucun accès aux prix ni aux données financières**. Matricule + PIN.
- **Expert-comptable (back-office, lecture seule + export)** : télécharge périodiquement les journaux, clôtures et exports de ventes. 2FA TOTP obligatoire.
- **Contrôleur fiscal / auditeur (back-office, lecture seule)** : reconstitution des opérations via exports journal + archives. 2FA TOTP obligatoire.
- **Administrateur plateforme CaisseFlow (back-office, hors restaurant)** : gère les restaurants clients, les licences, la dégradation progressive. N'a **jamais** accès en écriture aux journaux fiscaux.

### 3.2 Permissions & Access Control Matrix (RBAC)

| Entity / Resource | Gérant | Second | Serveur (terminal) | Cuisine (KDS) | Expert-comptable | Contrôleur fiscal | Admin plateforme | Public/Non-auth |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Commandes (salle/comptoir)** | C,R,U(ouvre/édite avant envoi) | C,R,U | C,R,U(pré-encaissement) | R(préparation) | R(export) | R(export) | — | Denied |
| **Paiements / Encaissement** | C,R | C,R | **Denied (techniquement désactivé)** | Denied | R(export) | R(export) | — | Denied |
| **Annulations / Remises** | C(après validation) | C + validation | Demande seulement | Denied | R(export) | R(export) | — | Denied |
| **Tickets de caisse** | R + réimpression journalisée | R | R (non-payables) | Denied | R(export) | R(export) | — | Denied |
| **Journal fiscal local (Journal Permanent)** | R(lecture append-only) | R(lecture) | Denied | Denied | R(réplique) | R(réplique) | R(réplique) | Denied |
| **Clôtures Z** | C,R | C,R | Denied | Denied | R(export) | R(export) | R | Denied |
| **Menu / Articles / TVA** | C,R,U,D | R | R | R(noms sans prix) | R(export) | R(export) | — | Denied |
| **Tables / Salles** | C,R,U,D | R,U(dispo table) | R,U(dispo table) | — | — | — | — | Denied |
| **Utilisateurs & PIN** | C,R,U(matricules+roles) | — | — | — | — | — | R | Denied |
| **Rapports de ventes (BO)** | R | R(résumé) | Denied | Denied | R | R | R | Denied |
| **Exports comptables / archives** | R | Denied | Denied | Denied | C,R(export) | C,R(export) | R | Denied |
| **Licence / abonnement** | R(état) | — | — | — | — | — | C,R,U | Denied |
| **Audit logs back-office** | R(restaurant) | Denied | Denied | Denied | R | R | R | Denied |

*Legend: C = Create, R = Read, U = Update, D = Delete. Aucun rôle ne possède D sur une entité fiscale (journal, clôtures, paiements, tickets encaissés) : toute correction est une nouvelle écriture. Règle transversale : aucune connexion anonyme, y compris sur la tablette caisse.*

---

## 4. Scope & Phasing

### 4.1 In Scope (MVP Core Capabilities)

1. **Authentification** : back-office e-mail + mot de passe fort (≥ 12 caractères) + 2FA TOTP (obligatoire profils sensibles, recommandée gérant), invitations à usage unique, sessions courtes révocables, journalisation des connexions ; mobile matricule + PIN 4–6 chiffres hashé localement (Argon2/bcrypt), jamais transmis au cloud, validation 100 % locale, verrouillage auto après inactivité (2–5 min paramétrable), blocage après 5 échecs journalisé.
2. **Prise de commande** : service à table (plan de salle, transfert de table) et comptoir/à emporter ; envoi cuisine (KDS) ; terminaux de salle reliés à la tablette caisse en réseau local.
3. **Encaissement** (tablette caisse uniquement) : paiement par carte via **TPE externe** (montant + résultat saisis/enregistrés), espèces (calcul du rendu), paiement mixte ; ticket de caisse conforme (impression ESC/POS) ; TVA multi-taux.
4. **Journal Permanent fiscal (cœur NF525)** : append-only local SQLite, chaînage SHA-256, numérotation continue `POSTE-01-000001…`, chaque écriture rattachée à un utilisateur identifié, horodatée, avec motif ; événements d'ouverture/fermeture de session et de changement d'heure système journalisés ; détection d'altération par re-vérification du chaînage ; horloge non reculable (contrôle au premier contact serveur + détection de saut).
5. **Clôtures** : Z journalière locale scellée/signée, mensuelle ; consolidation côté cloud ; export PDP (récapitulatif périodique) ; archives signées répliquées.
6. **Synchronisation** : file idempotente côté tablette (UUID généré sur l'appareil), push append-only du journal vers le cloud, serveur réplique fidèlement sans jamais corriger ni réécrire ; données de référence « dernière version serveur gagnante » ; contrôle d'altération du chaînage à la réception.
7. **KDS cuisine** : tickets en colonnes (nouveau / en cours / prêt), profile restreint sans prix.
8. **Back-office web** : menu & TVA, utilisateurs & droits, tables/salles, rapports de ventes (jour/semaine/mois, par taux de TVA), exports comptables (CSV/PDF/JSON signés), consultation en lecture du journal répliqué, gestion de la licence.
9. **Licence & dégradation progressive** : jeton de licence vérifié à chaque synchronisation ; Phase 1 J+0→30 rappels ; Phase 2 J+30→60 suspension des fonctions cloud (back-office, rapports avancés, sync), caisse locale opérationnelle ; Phase 3 >J+60 blocage du lancement mobile avec message commercial ; **jamais** de suppression ni de blocage d'accès aux données fiscales, export toujours disponible.
10. **Sécurité & exploitation** : JWT + refresh token, stockage local chiffré, mode kiosque (sortie par code administrateur), mise à jour forcée (version trop ancienne refusée avec message clair), installation APK documentée < 10 min, sauvegardes et supervision.

### 4.2 Out of Scope / Boundaries & Guardrails

- **Aucune suppression ni modification d'écritures fiscales**, par aucun rôle, par aucune interface, jamais (toute correction = nouvelle écriture).
- **Aucun encaissement sur un poste autre que la tablette caisse** (techniquement désactivé, pas masqué).
- **Aucune intégration TPE directe** en v0.1 : le TPE reste un terminal externe ; CaisseFlow enregistre montant, moyen et résultat.
- **Aucun paiement en ligne client** en v0.1 (pas de Stripe/PayPal).
- **Pas de mode kiosque anonyme** : toujours un utilisateur identifié.
- Pas de dark mode ; pas de commande client par QR code en v0.1 ; pas de gestion de stock en v0.1 ; pas de livre de recettes comptable complet (l'expert-comptable importe les exports dans son propre outil).

### 4.3 Phasing & Roadmap Milestones

| Milestone | Scope Summary | Target Criteria |
| --- | --- | --- |
| **Phase 1: MVP (Current)** | Caisse complète (tables + comptoir), journal NF525 local + clôtures Z, sync idempotente, KDS, back-office, exports comptables, licence | Critères d'acceptation A10 points 1–12, 18–21, 27 validés ; audits security/qa sans FAIL |
| **Phase 2: Operational** | Commande client par QR code (paiement à table), gestion de stock, exports PDF périodiques automatiques, notifications multi-canaux | Pilote en service réel validé ; premiers retours terrain intégrés |
| **Phase 3: Scale & Analytics** | Multi-restaurants / sièges sociaux, rapports avancés et comparatifs, annuelles consolidées, tableau de bord siège | 3–5 restaurants ; zéro refonte du socle |

---

## 5. Assumptions, Dependencies & Constraints

### 5.1 Technical Assumptions

- [ASSUMPTION] **WatermelonDB** est retenu comme couche SQLite locale sur la tablette caisse (préféré à Realm : maturité React Native, base SQLite standard, pipeline de synchronisation éprouvé, indexation performante sur journal volumineux). Décision technique laissée à l'agent par le client.
- [ASSUMPTION] Le couplage terminal→tablette en réseau local utilise un **serveur HTTP/WebSocket embarqué** dans l'app caisse (découverte par mDNS ou IP fixe du restaurant, authentification par jeton de terminal provisionné au moment de l'installation). Protocole exact finalisé à la conception technique.
- [ASSUMPTION] Les paiements carte sont opérés sur un **TPE externe** (banque, contrat du restaurant) ; CaisseFlow enregistre le montant, le moyen et le résultat. Une intégration TPE directe reste une piste Phase 2/3 (voir 16).
- [ASSUMPTION] Impression **ESC/POS directe depuis React Native** (sans pilote OS) : Bluetooth (portables), USB OTG (tablette caisse), TCP/IP :9100 (cuisine/installations fixes), découverte mDNS — voir module IMP (7.9) ; modèles cibles proposés en section 16.
- [ASSUMPTION] Les scellés de clôture (Z) sont signés avec une **clé asymétrique générée sur l'appareil** (Android Keystore) ; la clé publique est enregistrée au cloud au provisioning ; le serveur vérifie la signature à l'archivage.
- [ASSUMPTION] Archives fiscales : format **JSON canonique signé + PDF/CSV lisibles**, conservés en stockage objet sur le VPS avec stratégie de rétention 6 ans (aucune purge avant échéance).
- [ASSUMPTION] Un restaurant = un préfixe de poste ; pilote à 1 tablette caisse ⇒ `POSTE-01` seul, mais le mécanisme multi-postes (`POSTE-02`, …) est implémenté et testé.
- [ASSUMPTION] Kiosque Android via device-owner / screen pinning configuré au provisioning de la tablette.
- [ASSUMPTION] L'IA effectue le développement complet (l'équipe ne connaît pas React) : conventions de code explicites, tests automatisés systématiques, documentation détaillée.

### 5.2 Business & Operational Constraints

- Un seul restaurant pilote en année 1 ; ~50 000 écritures fiscales/an.
- Gestion serveur **interne** (client) : mises à jour et correctifs hors heures de service, sauvegardes PostgreSQL quotidiennes + rétention longue 6 ans, **tests de restauration réguliers**, supervision logs/alertes, rollback Dokploy.
- Fenêtres de maintenance planifiées hors heures de service du restaurant.
- Modèle de licence : dégradation progressive J+30 / J+60 avec garde-fous NF525 (CGV, préavis, mise en demeure, export toujours possible, rétablissement sans perte de numérotation).
- Le blocage d'impayé est piloté par **jeton de licence vérifié à chaque synchronisation** ; la tablette reste autonome tant que la licence est valide.

### 5.3 Compliance, Security & Privacy Constraints

- **NF525 / art. 286 I-3° CGI** : Inaltérabilité (chaînage SHA-256, append-only), Sécurisation (authentification nominative, contrôle d'horloge, validation à deux), Conservation (6 ans, aucune purge anticipée), Archivage (PDP périodiques, exports reconstituables, scellés signés).
- Données personnelles : minimisation (matricule + nom du personnel ; aucune donnée client identifiée persistée en v0.1), conformité RGPD (droit d'accès pour les utilisateurs du personnel).
- Audit trail : toute action sensible enregistre utilisateur, horodatage, motif, éventuellement validateur (second) ; les logs sont append-only.
- Secret isolation : aucun secret de base de données ou jeton de service dans le bundle client ; PIN jamais transmis au cloud ; clés de scellé jamais hors Keystore.

---

## 6. Technology Decision & System Architecture

### 6.1 Stack Architecture & Justification

| Layer | Chosen Technology | Engineering Rationale | Rejected Alternatives & Trade-offs |
| --- | --- | --- | --- |
| **Backend / API Engine** | Next.js (Route Handlers) conteneurisé Docker | Un seul projet : back-office web + API mobile ; SSR pour le back-office ; déploiement Dokploy identique dev→prod | Node/Express séparé : double codebase à maintenir ; Vercel : pas de Docker, contrôle moindre sur les données fiscales |
| **Primary Database (cloud)** | PostgreSQL + Prisma | Fiabilité transactionnelle, contraintes d'intégrité pour les répliques fiscales, backup/restore éprouvés | Firebase/NoSQL : garanties transactionnelles et exports fiscaux plus faibles |
| **Local Database (tablette caisse)** | SQLite via WatermelonDB | Source de vérité du journal : SQLite journal/WAL, requêtes indexées, pas de dépendance réseau | Realm : format propriétaire plus difficile à auditer/extraire fiscalement |
| **Mobile Apps** | React Native (2 variantes depuis une base de code commune) | Demandé explicitement par le client ; Android natif mature pour POS, Keystore pour les clés | Flutter : cohérent mais hors demande ; PWA : pas de Keystore ni kiosque fiable |
| **Authentication & RBAC** | JWT + refresh tokens (API), Argon2 PIN local, TOTP 2FA web | Fonctionne offline pour le PIN ; RBAC applicatif + RLS PostgreSQL en défense en profondeur | Sessions cookies seules : inadaptées à une app mobile |
| **File Storage** | Stockage objet sur le VPS (ex. MinIO/S3-compatible) pour archives signées | Contrôle total des données fiscales, rétention maîtrisée 6 ans | Cloud managé tiers : duplique les données fiscales hors maîtrise |
| **Hosting & Deployment** | VPS Hetzner/OVH/Scaleway + Dokploy, Docker dès le jour 1 | Conteneurs portables dev→préprod→prod sans réécriture ; coût fixe ; indépendance PaaS ; contrôle total des données fiscales | Vercel/Railway : moins de contrôle, verrouillage |

**Justification de l'ensemble (6.1 — raison du choix)** : la tablette caisse reste **maîtresse des encaissements** : elle tient seule le journal fiscal inaltérable local (chaînage SHA-256, numérotation continue, clôtures signées) et fonctionne 100 % hors ligne, tandis que le backend cloud (Next.js + PostgreSQL) se limite à l'archivage, aux rapports et au back-office — garantissant **un seul poste fiscal au sens NF525** et une conformité **jamais dépendante du réseau**.

### 6.2 Services, Configuration & Secret Separation

| Configuration Item | Exposure Level | Target Environment / Variable | Notes |
| --- | --- | --- | --- |
| Public API URL | Client (Public) | `NEXT_PUBLIC_API_URL` | URL publique de l'API, sans secret |
| Database Connection String | Server (Confidential) | `DATABASE_URL` | Jamais exposé au bundle client |
| JWT Signing Secret | Server (Strict Secret) | `JWT_SECRET` | Rotation prévue ; tokens courts |
| Device Provisioning Token | Device (Confidential, chiffré local) | `DEVICE_TOKEN` | Par tablette/terminal, révocable |
| Terminal LAN Token | Device (Confidential, chiffré local) | `TERMINAL_TOKEN` | Auth terminal→tablette |
| Fiscal Archive Signing Key | Device (Strict Secret) | Android Keystore | Ne quitte jamais l'appareil |
| SMTP Credentials | Server (Strict Secret) | `SMTP_URL` | Invitations, rappels de licence |
| Admin Bootstrap Credentials | Server (Strict Secret) | `ADMIN_BOOTSTRAP` | Uniquement au premier démarrage |

### 6.3 System Architecture Diagram

```text
┌──────────────────────── RESTAURANT (réseau local Wi-Fi) ────────────────────────┐
│                                                                                │
│  TERMINAUX SERVEURS (2–3)                    TABLETTE CAISSE (POSTE-01)        │
│  React Native — prise de commande            React Native — SEUL POSTE FISCAL  │
│  ┌──────────────────────────┐   LAN (HTTP/WS) ┌───────────────────────────────┐ │
│  │ connexion matricule+PIN  │ ──────────────▶ │ SQLite (WatermelonDB)         │ │
│  │ plan de salle / articles │   jeton terminal│  ├ journal_permanent (append) │ │
│  │ PAS de fonction paiement │                 │  ├ sync_queue (UUID idempotent)│ │
│  └──────────────────────────┘                 │  ├ clotures_Z (scellés signés) │ │
│  ┌──────────────────────────┐                 │  └ users/articles/tables sync  │ │
│  │ KDS CUISINE (RN)         │ ──────────────▶ │ Journal: seq continue         │ │
│  │ matricule+PIN, sans prix │   LAN (WS)      │  POSTE-01-000001…             │ │
│  └──────────────────────────┘                 │ hash_chain: SHA-256           │ │
│                                               │ Esc/POS printer (BT/USB)      │ │
│                                               └──────────────┬────────────────┘ │
└──────────────────────────────────────────────────────────────┼──────────────────┘
                                                push append-only, HTTPS, JWT device
                                                               ▼
┌──────────────── VPS (Hetzner/OVH/Scaleway) — Docker/Dokploy ───────────────────┐
│  Next.js (back-office web + API Route Handlers)   │  PostgreSQL (Prisma)       │
│  ├ module nf525/ (logique fiscale isolée)         │  ├ journal_replica (no U/D)│
│  ├ /api/sync/push (idempotent, chaînage vérifié)  │  ├ clotures / archives     │
│  ├ /api/sync/pull (référence: serveur gagnant)    │  ├ restaurants / users_web │
│  ├ /api/licence (jeton, dégradation J+30/J+60)    │  ├ menu / tables / tva     │
│  ├ back-office: menu, users, rapports, exports    │  └ audit_log (append-only) │
│  └ exports: CSV/PDF/JSON signés, PDP, archives 6 ans (stockage objet VPS)      │
└────────────────────────────────────────────────────────────────────────────────┘
          ▲ e-mail (invitations, 2FA, rappels licence)            ▲
          └── SMTP                                                │ HTTPS
                                                Gérant / Expert-comptable /
                                                Contrôleur fiscal (navigateur)
```

### 6.4 Data Consistency & Failure Isolation Strategy

- **Journal append-only par construction** : aucune instruction UPDATE/DELETE n'existe sur `journal_permanent` (local) et `journal_replica` (cloud) ; triggers PostgreSQL bloquent UPDATE/DELETE en défense en profondeur ; l'app n'expose aucune route d'écriture autre qu'INSERT.
- **Idempotence** : chaque opération porte un UUID généré côté appareil ; le serveur (et la file locale) déduplique sur `(restaurant_id, uuid)` — recevoir deux fois la même opération ne crée jamais une seconde écriture.
- **Chaînage vérifié deux fois** : à l'insertion locale (hash du précédent) et à la réception cloud (re-vérification du chaînage complet du lot) ; toute rupture → alerte immédiate + lot rejeté + incident journalisé.
- **Numérotation continue** : `seq` = compteur local monotone ; préfixe par poste ; aucune réassignation ; les clôtures Z ferment chaque période avec le dernier `seq` et dernier `hash` comme référence de coupure.
- **Transactions** : encaissement = une transaction locale (commande + paiements + écriture journal + ticket) — tout ou rien ; crash au milieu ⇒ rollback complet, reprise au redémarrage.
- **Référence vs opérationnel** : menu/utilisateurs/tables = « dernière version serveur gagnante » ; journal/clôtures = push-only jamais réécrits.
- **Fallbacks** : API externe (e-mail) indisponible ⇒ file d'attente + retry ; synchro impossible ⇒ la caisse fonctionne, la file s'allonge (3 jours testés) ; perte TPE ⇒ saisie manuelle du résultat avec événement journalisé.

---

## 7. Functional Requirements & Business Rules

### 7.1 Module: FISC — Journal Permanent & Conformité NF525 (tablette caisse)

**User Story:** En tant que gérant, je veux que chaque opération d'encaissement et chaque action sensible produise une écriture inaltérable et chaînée localement, afin de garantir la conformité NF525 même sans internet.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **FISC-1** | Journal Permanent append-only local : vente, encaissement, ticket, annulation, remise, changement de prix, ouverture/fermeture de session, changement d'heure système, clôture Z | **Mandatory** | INSERT seul ; seq auto-incrément continu ; préfixe `POSTE-01-` ; aucune UPDATE/DELETE possible (pas d'API, pas d'UI, triggers SQLite) |
| **FISC-2** | Chaînage SHA-256 : chaque écriture contient `hash_precedent` et `hash_courant = SHA-256(hash_precedent \|\| payload canonique)` | **Mandatory** | Rupture de chaîne détectable par contrôle de chaînage complet (local au démarrage + à chaque clôture + à la réception cloud) |
| **FISC-3** | Chaque écriture porte : utilisateur (matricule + nom), horodatage local, type d'événement, motif (si applicable), validateur (second, si applicable) | **Mandatory** | Aucune écriture anonyme ; sessions journalisées |
| **FISC-4** | Contrôle d'horloge : au premier contact serveur, comparaison heure locale vs serveur ; saut > seuil (60 s) ⇒ événement journalisé + correction progressive ; recul d'horloge détecté ⇒ bloqué ou journalisé, chronologie intacte | **Mandatory** | Horodatages de journal : jamais antérieurs au dernier enregistré (monotonic guard) |
| **FISC-5** | Clôture Z journalière locale : totaux HT/TVA par taux/TTC, nb tickets, dernier seq/hash, **scellé signé** (clé asymétrique Keystore) | **Mandatory** | Scellé exportable + répliqué ; une seule Z par jour et par poste ; Z journalisée dans le journal |
| **FISC-6** | Clôture mensuelle consolidée côté cloud, assemblée depuis les Z répliquées, signée serveur | Important | Aucune recomputation des écritures ; consolidation = agrégation vérifiée |
| **FISC-7** | Détection d'altération : contrôle de chaînage complet au démarrage de l'app caisse | **Mandatory** | Si rupture : app refuse le service d'encaissement, affiche incident, incident exportable |
| **FISC-8** | Archivage cloud : réplique fidèle append-only (`journal_replica`), conservation 6 ans, aucune purge anticipée | **Mandatory** | Le serveur ne corrige ni ne réécrit jamais ; reconstitution possible par un auditeur |

#### Input Validation Matrix
| Field Name | Type | Required | Validation Constraints | Error Message |
| --- | --- | --- | --- | --- |
| `type_evenement` | enum | Yes | ∈ {VENTE, PAIEMENT, TICKET, ANNULATION, REMISE, CHANGEMENT_PRIX, SESSION, HORLOGE, CLOTURE_Z} | "Type d'événement inconnu" |
| `motif` | text | Annulation/Remise/Chgt prix | 3–500 caractères | "Motif obligatoire (3 caractères min.)" |
| `montant` | decimal | Yes (événements financiers) | > 0, ≤ 10 000 €, 2 décimales | "Montant invalide" |
| `hash_precedent` | hex | Yes | 64 caractères hexadécimaux, = hash de l'écriture précédente | "Chaînage rompu — incident" |

#### Acceptance Criteria (Given-When-Then)
- **Scenario 1 (Happy Path encaissement offline):**
  - **Given** la tablette caisse en mode avion, session gérant ouverte
  - **When** une commande comptoir de 5 articles est encaissée (TPE résultat saisi)
  - **Then** le ticket s'imprime, une écriture VENTE+PAIEMENT+TICKET apparaît dans le journal avec numérotation continue et chaînage vérifié, sans aucune connexion réseau.
- **Scenario 2 (Altération détectée):**
  - **Given** le journal local contient N écritures chaînées
  - **When** une ligne est modifiée manuellement dans la base locale
  - **Then** le contrôle de chaînage SHA-256 au démarrage détecte la rupture, l'encaissement est refusé et l'incident est signalé/exportable.
- **Scenario 3 (Horloge reculée):**
  - **Given** une session active et un journal à jour
  - **When** l'heure système est reculée de 30 min
  - **Then** l'opération est bloquée ou journalisée (HORLOGE) et aucun horodatage de journal n'est antérieur au précédent.

#### Edge Cases & Failure Handling
- Crash en pleine transaction : rollback complet, aucune écriture orpheline ; au redémarrage, contrôle de chaînage avant tout encaissement.
- Double Z : refusée, message "Clôture déjà effectuée pour le poste du jour".
- Base saturée : rétention locale glissante (les écritures répliquées et scellées peuvent être archivées hors tablette **sans rupture de chaîne** — export du segment scellé conservé).

### 7.2 Module: POS — Caisse & Encaissement (tablette caisse)

**User Story:** En tant que serveur/gérant, je veux créer une commande (table ou comptoir), la transmettre à la cuisine et l'encaisser en quelques gestes, afin de servir vite et encaisser sans erreur.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **POS-1** | Plan de salle : ouvrir une commande sur une table, transférer une commande entre tables, fusionner deux commandes (événements journalisés) | **Mandatory** | Une table = une commande active max ; transfert/fusion = écriture journal avec utilisateur |
| **POS-2** | Saisie articles par catégories (menu synchronisé depuis le cloud, TVA incluse) ; quantités, variantes/suppléments | **Mandatory** | Prix figés à l'ajout (snapshot prix dans la ligne de commande) ; changement de prix = événement journalisé si modifié en cours |
| **POS-3** | Envoi cuisine : la commande part au KDS ; suppléments en cours de service envoient un ticket complémentaire | **Mandatory** | Envoi = écriture VENTE (pré-encaissement) ; KDS affiche sans prix |
| **POS-4** | Encaissement : carte via TPE externe (montant + résultat enregistrés), espèces (calcul du rendu), paiement mixte, rattachement à la commande | **Mandatory** | Possible uniquement sur la tablette caisse ; techniquement désactivé sur les terminaux |
| **POS-5** | Ticket de caisse conforme : impression ESC/POS, mentions légales (SIRET, TVA par taux, numéro journal, poste), réimpression journalisée | **Mandatory** | Numéro de ticket = référence journal ; réimpression = événement journalisé (ticket marqué "COPIE") |
| **POS-6** | Annulation d'article ou de commande : motif + matricule + PIN du demandeur + validation du second (si configuré) | **Mandatory** | **Nouvelle écriture ANNULATION**, jamais modification ; annulation journalisée avec validateur |
| **POS-7** | Remise / changement de prix : motif + matricule + PIN + validation second (si configuré) ; plafonds paramétrables par le gérant | **Mandatory** | Écritures REMISE / CHANGEMENT_PRIX avec utilisateur, horodatage, motif |
| **POS-8** | Comptoir / à emporter : saisie directe sans table | **Mandatory** | Même chaîne fiscale ; type de commande différencié dans le journal |
| **POS-9** | Clôture de service : Z journalière (FISC-5) accessible depuis l'écran caisse par le gérant/second | **Mandatory** | Gérant ou second uniquement |

#### Input Validation Matrix
| Field Name | Type | Required | Validation Constraints | Error Message |
| --- | --- | --- | --- | --- |
| `matricule` | text | Yes | 1–8 caractères alphanumériques, utilisateur actif | "Matricule inconnu ou désactivé" |
| `pin` | code | Yes | 4–6 chiffres ; blocage après 5 échecs (journalisé) | "PIN incorrect (X/5)" |
| `motif` | text | Annulations/remises | 3–500 caractères | "Motif obligatoire" |
| `montant_encaisse` | decimal | Yes | > 0, ≤ total ou > total (rendu), ≤ 10 000 € | "Montant invalide" |

#### Acceptance Criteria (Given-When-Then)
- **Scenario 1 (Annulation validée):**
  - **Given** une commande servie avec un article en trop, second disponible
  - **When** le serveur demande l'annulation (motif), le second saisit son matricule+PIN pour valider
  - **Then** une écriture ANNULATION est créée (demandeur, validateur, motif, horodatage) et le total recalculé ; aucune ligne modifiée.
- **Scenario 2 (Paiement impossible sur terminal):**
  - **Given** un terminal de prise de commande
  - **When** toute tentative d'accéder à la fonction paiement (UI, API, binaire)
  - **Then** l'accès est refusé techniquement (code non présent / endpoint inexistant côté terminal).

#### Edge Cases & Failure Handling
- Imprimante hors ligne : encaissement possible, ticket en file d'attente d'impression, statut visible, réimpression à la reconnexion ; événement journalisé.
- TPE indisponible : encaissement espèces ou report ; saisie manuelle résultat TPE = événement journalisé.
- Table payée partiellement : paiement fractionné supporté ; chaque part = écriture PAIEMENT distincte.

### 7.3 Module: SYNC — Synchronisation offline-first

**User Story:** En tant que gérant, je veux que ma caisse fonctionne des jours sans internet et que tout se réplique sans doublon ni perte à la reconnexion.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **SYNC-1** | File de synchronisation idempotente : chaque opération porte un UUID généré côté appareil | **Mandatory** | Déduplication serveur sur `(restaurant_id, uuid)` ; renvoi double ⇒ une seule écriture |
| **SYNC-2** | Push append-only du journal (lots ordonnés par seq) + clôtures Z scellées | **Mandatory** | Re-verification du chaînage du lot à la réception ; lot rompu ⇒ rejet + incident |
| **SYNC-3** | Pull des données de référence (menu, TVA, utilisateurs, droits, tables) — « dernière version serveur gagnante » | **Mandatory** | Delta par `updated_at` ; conflit prix/menues gérés côté serveur uniquement |
| **SYNC-4** | Résilience : 3 jours hors ligne testés ; numérotation continue sans trou ; deux tablettes hors ligne sans collision (`POSTE-01`/`POSTE-02`) | **Mandatory** | Préfixe par poste au provisioning ; chaque poste a son compteur propre |
| **SYNC-5** | Reprise après crash brutal en pleine vente : aucune perte d'écriture, journal cohérent au redémarrage | **Mandatory** | Transaction locale + WAL SQLite + contrôle de chaînage au démarrage |
| **SYNC-6** | Jeton de licence vérifié à chaque synchronisation (voir 7.7) | **Mandatory** | Licence invalide ⇒ dégradation progressive, jamais suppression de données |
| **SYNC-7** | Backoff exponentiel + file persistante : retries sans écrasement d'ordre | Important | Ordre des seq préservé ; lots partiels jamais sautés |

#### Acceptance Criteria (Given-When-Then)
- **Scenario 1 (Reconnexion sans doublon):**
  - **Given** 3 jours d'opérations hors ligne dans la file locale
  - **When** la tablette reçoit du réseau et pousse 2 fois le même lot
  - **Then** le serveur n'accepte chaque UUID qu'une fois, la réplique est identique au journal local, `seq` continue sans trou.
- **Scenario 2 (Crash en pleine vente):**
  - **Given** un encaissement en cours, alimentation coupée
  - **When** la tablette redémarre
  - **Then** au démarrage le contrôle de chaînage passe, la commande en cours est retrouvée dans son état pré-crash, aucune écriture perdue ou corrompue.

#### Edge Cases & Failure Handling
- Serveur indisponible pendant des semaines : la file locale grandit ; compression par lots ; alerte locale discrète "synchronisation en attente" ; aucune limite bloquante d'encaissement.
- Journal local en avance sur l'archive (écritures non répliquées) : état visible dans l'UI caisse ("N écritures à synchroniser").
- Conflit d'horloge entre tablette et serveur : FISC-4 gère ; le serveur n'écrase jamais les horodatages locaux.

### 7.4 Module: TERM — Terminaux de prise de commande (salle)

**User Story:** En tant que serveur, je veux prendre la commande sur ma tablette et l'envoyer à la caisse/cuisine, sans jamais pouvoir encaisser.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **TERM-1** | Connexion matricule + PIN validée **localement sur la tablette caisse** (base utilisateurs synchronisée) | **Mandatory** | PIN hashé côté serveur de référence, jamais en clair ; terminal ne stocke que son jeton |
| **TERM-2** | Prise de commande (articles, variantes, remarques) envoyée à la tablette caisse en LAN | **Mandatory** | Chaque commande reçoit un UUID terminal ; idempotence à l'envoi |
| **TERM-3** | Fonction paiement **techniquement désactivée** : pas d'écran de paiement, pas de code, pas d'endpoint d'encaissement exécutable sur le terminal | **Mandatory** | Vérification au build et au runtime ; test A10 n°17 |
| **TERM-4** | Suivi de l'état de la commande (envoyée / en préparation / servie) | Important | Lecture seule sur le flux KDS |
| **TERM-5** | Découverte de la tablette caisse : mDNS/IP local + jeton terminal provisionné à l'installation | Important | Provisioning documenté (installation < 10 min) |

#### Acceptance Criteria (Given-When-Then)
- **Scenario 1:** Given un serveur connecté sur terminal ; When il envoie une commande ; Then la tablette caisse la reçoit (< 2 s en LAN), crée la commande locale, l'écriture VENTE est de l'utilisateur serveur identifié.
- **Scenario 2:** Given le Wi-Fi restaurant coupé ; When le serveur envoie une commande ; Then mise en file locale du terminal, envoi automatique au retour du LAN ; aucun encaissement possible dans tous les cas.

### 7.5 Module: KDS — Cuisine (écran de préparation)

**User Story:** En tant que commis de cuisine, je veux voir les tickets à préparer en colonnes et marquer leur avancement, sans voir de prix.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **KDS-1** | Affichage tickets en colonnes : nouveau / en cours / prêt | **Mandatory** | Temps d'attente visible ; tri chronologique |
| **KDS-2** | Actions : démarrer, marquer prêt, signaler rupture | **Mandatory** | Événements propagés aux terminaux ; rupture visible en salle |
| **KDS-3** | Profil restreint : noms d'articles, quantités, table, numéros — **jamais de prix ni de données financières** | **Mandatory** | L'API KDS filtre les montants ; vérifié par test de non-fuite |
| **KDS-4** | Connexion matricule + PIN ; session verrouillée à l'inactivité | **Mandatory** | Même mécanisme que la salle |

### 7.6 Module: BO — Back-office web (Next.js)

**User Story:** En tant que gérant, je veux gérer le menu, les prix, les utilisateurs et les rapports depuis le web, et laisser l'expert-comptable télécharger ses exports.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **BO-1** | Gestion menu : catégories, articles, prix HT/TTC, taux TVA multi-taux, disponibilité, variantes | **Mandatory** | Versionnement prix : changement = nouvelle version datée (traçabilité) ; propagation en push aux appareils |
| **BO-2** | Gestion utilisateurs & droits : matricules, PIN, rôles, plafonds remises, activation/désactivation | **Mandatory** | Invitation PIN par le gérant ; désactivation ≠ suppression ; propagation au prochain sync |
| **BO-3** | Gestion tables/salles | **Mandatory** | Synchronisé aux appareils |
| **BO-4** | Rapports de ventes : jour/semaine/mois, par article, catégorie, taux TVA, serveur | **Mandatory** | Source : réplique cloud ; cohérence vérifiable par chaînage |
| **BO-5** | Exports comptables : CSV/PDF/JSON signés, journal + clôtures + PDP ; consultation lecture du journal répliqué | **Mandatory** | Accès expert-comptable / auditeur / gérant ; chaque export journalisé |
| **BO-6** | Consultation du journal répliqué (lecture seule, recherche, filtres) | Important | Aucune action d'écriture possible |
| **BO-7** | Gestion de la licence (état, dates, messages) | **Mandatory** | Voir 7.7 |
| **BO-8** | Audit logs back-office (connexions, modifications, exports) append-only | **Mandatory** | Conforme 10.5 |

#### Input Validation Matrix
| Field Name | Type | Required | Validation Constraints | Error Message |
| --- | --- | --- | --- | --- |
| `email` | email | Yes | RFC 5322, domaine valide | "Adresse e-mail invalide" |
| `password` | password | Yes | ≥ 12 caractères, complexité vérifiée | "Mot de passe trop faible (12 caractères min.)" |
| `totp_code` | code | Yes (profils sensibles) | 6 chiffres, fenêtre ±30 s | "Code 2FA invalide" |
| `prix_ttc` | decimal | Yes | 0–10 000 €, 2 décimales | "Prix invalide" |
| `taux_tva` | percent | Yes | ∈ {0, 5.5, 10, 20} + taux personnalisés validés | "Taux de TVA invalide" |

### 7.7 Module: LIC — Licence & dégradation progressive

**User Story:** En tant qu'éditeur CaisseFlow, je veux dégrader progressivement le service en cas d'impayé sans jamais toucher aux données fiscales du restaurant.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **LIC-1** | Jeton de licence signé serveur, vérifié par la tablette à chaque synchronisation | **Mandatory** | Contient : restaurant, état, échéances, fenêtre de grâce ; validé localement même après coupure réseau (cache avec date d'expiration) |
| **LIC-2** | Phase 1 (J+0→30 impayé) : rappels non bloquants in-app + back-office + e-mail | **Mandatory** | Tout fonctionne |
| **LIC-3** | Phase 2 (J+30→60) : suspension des fonctions cloud — back-office, rapports avancés, synchronisation ; **caisse locale opérationnelle** (encaissement, journal, clôtures) | **Mandatory** | Aucun impact fiscal ; bandeau d'information à l'ouverture |
| **LIC-4** | Phase 3 (> J+60) : blocage du lancement de l'app mobile avec message clair (contact service commercial) | **Mandatory** | Données fiscales **toujours exportables sur demande** (moyen d'extrusion prévu : export local du journal + archives) |
| **LIC-5** | Garde-fous : CGV explicites (seuil 60 j, préavis, mise en demeure écrite préalable), **aucune suppression ni blocage d'accès aux données**, rétablissement immédiat dès régularisation, continuité de numérotation | **Mandatory** | Implémentation + procédure documentée ; test A10 n°25–26 |

#### Acceptance Criteria (Given-When-Then)
- **Scenario 1:** Given un abonnement impayé de 45 jours ; When la tablette se synchronise ; Then jeton "grace2" retourné : cloud suspendu, encaissement local 100 % opérationnel.
- **Scenario 2:** Given un impayé de 75 jours ; When l'app mobile est lancée ; Then lancement bloqué avec message commercial ; When l'exploitant demande l'export ; Then journal et archives sont extraibles localement (mécanisme d'extrusion documenté).

### 7.8 Module: SEC — Sécurité, kiosque & exploitation mobile

| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **SEC-1** | Mode kiosque Android : sortie de l'app caisse impossible sans code administrateur | **Mandatory** | Device-owner/screen pinning au provisioning ; code paramétrable par le gérant |
| **SEC-2** | Mise à jour forcée : version trop ancienne refusée par le backend avec message clair | **Mandatory** | Version minimale publiée côté serveur ; vérification à chaque sync/lancement |
| **SEC-3** | Stockage local chiffré (jetons, base locale sensible) ; PIN hashé (Argon2) jamais transmis | **Mandatory** | Aucun secret dans le bundle client |
| **SEC-4** | Installation APK documentée < 10 min sur tablette Android neuve (checklist + provisioning) | **Mandatory** | Procédure pas-à-pas livrée |
| **SEC-5** | Sessions mobile verrouillées après inactivité (2–5 min paramétrable) et à la fermeture | **Mandatory** | Rouverture par matricule+PIN |
| **SEC-6** | Verrouillage après 5 échecs de PIN, tentatives journalisées | **Mandatory** | Déblocage par le gérant |
| **SEC-7** | Rate limiting : auth API (web) ≤ 60 req/min/IP ; endpoints sensibles (login, export) plus stricts | **Mandatory** | Voir 10.2 |

### 7.9 Module: IMP — Impression ticket (applications mobiles)

**User Story:** En tant que gérant, je veux que chaque poste (caisse, serveur, cuisine) imprime ses tickets sur l'imprimante de mon choix, sans que la moindre panne d'imprimante ne bloque l'encaissement ni la conformité.

#### Capabilities & Functional Matrix
| ID | Requirement Description | Priority | Business Logic & Rules |
| --- | --- | --- | --- |
| **IMP-1** | Modes de connexion V1 : **Bluetooth** (ESC/POS portables : Xprinter, Star, Epson TM-P, Goojprt), **USB OTG** (tablette caisse fixe), **réseau local TCP/IP port 9100** (imprimantes de cuisine et installations fixes), **Wi-Fi direct/mDNS** pour la découverte automatique des imprimantes réseau | **Mandatory** | Communication directe ESC/POS depuis React Native — aucun pilote OS ni service d'impression Android |
| **IMP-2** | Configuration par poste : chaque appareil peut avoir sa propre imprimante associée (ou plusieurs : ticket client + ticket cuisine) | **Mandatory** | Écran de configuration dédié en back-office et sur l'appareil (réservé gérant/admin) : découverte, appairage BT, saisie IP/port, **test d'impression** ; configuration stockée localement et synchronisée via le backend pour réapplication en cas de remplacement d'appareil |
| **IMP-3** | File d'impression locale persistante (SQLite) : imprimante hors ligne ⇒ tickets en attente, réimprimés au retour de la connexion | **Mandatory** | L'impression **ne conditionne jamais l'écriture fiscale** : le ticket est écrit dans le journal **avant** d'être envoyé à l'imprimante ; une imprimante en panne ne bloque ni l'encaissement ni NF525 |
| **IMP-4** | Statuts d'impression journalisés : envoyé, imprimé, échec, réimprimé ; réimpression manuelle journalisée (utilisateur, motif, horodatage) | **Mandatory** | Événements IMPRESSION répliqués vers le cloud comme tout événement fiscal |
| **IMP-5** | Contenu du ticket (mentions légales NF525) : numérotation continue (`POSTE-01-000123`), date/heure, identité du restaurant (nom, adresse, SIRET), détail des articles, TVA par taux, total, mode de paiement, matricule du caissier, hash (empreinte courte) de vérification | **Mandatory** | Modèle configurable en back-office (logo, mentions complémentaires) mais **champs légaux non modifiables** |
| **IMP-6** | Double ticket (client + cuisine) : une seule commande, **deux files d'impression distinctes** | Important | Chaque file a son imprimante et son état indépendants |
| **IMP-7** | Rendu, pas source : le ticket imprimé n'est pas le journal fiscal — le journal reste la source de vérité (append-only, chaîné) ; toute impression/réimpression est un événement journalisé localement et répliqué | **Mandatory** | Cohérent avec FISC-1 (événement TICKET) |

#### Input Validation Matrix
| Field Name | Type | Required | Validation Constraints | Error Message |
| --- | --- | --- | --- | --- |
| `ip:port` | text | Mode réseau | IPv4/IPv6 valide + port 1–65535 (par défaut 9100) | "Adresse d'imprimante invalide" |
| `modele_ticket` | json | Oui (back-office) | Champs légaux non masquables/modifiables | "Champ légal obligatoire" |

#### Acceptance Criteria (Given-When-Then)
- **Scenario 1 (Impression offline Bluetooth):**
  - **Given** la tablette caisse en mode avion, imprimante Bluetooth appairée
  - **When** un encaissement est validé
  - **Then** l'écriture fiscale est enregistrée d'abord, le ticket s'imprime, l'événement IMPRESSION est journalisé.
- **Scenario 2 (Imprimante en panne — résilience):**
  - **Given** une imprimante débranchée, encaissement en cours
  - **When** le paiement est validé
  - **Then** l'écriture fiscale est tout de même enregistrée, la file d'impression conserve le ticket, et le ticket s'imprime **automatiquement** au rebranchement ; le statut d'impression (échec puis imprimé) est journalisé.

#### Edge Cases & Failure Handling
- Imprimante réseau perdue au changement d'IP (DHCP) : découverte mDNS re-propose l'imprimante ; test d'impression obligatoire pour réassocier.
- Ticket tronqué (papier manquant) : détection échec → mise en file complète, jamais de réimpression partielle silencieuse.
- Deux imprimantes en échec simultané : la commande reste encaissée ; alerte permanente « N tickets en attente d'impression ».

---

## 8. Main User Flows & State Machines

### 8.1 Primary End-to-End User Flow (Happy Path — service à table)

1. **Authentification:** le serveur saisit matricule + PIN sur son terminal ; validation locale sur la tablette caisse (base synchronisée) ; session ouverte (événement SESSION journalisé côté caisse).
2. **Ouverture de commande:** sélection de la table sur le plan de salle ; commande `ouverte` créée (UUID terminal).
3. **Prise de commande:** ajout d'articles par catégories (prix snapshot) ; remarques cuisine ; validation.
4. **Envoi:** commande transmise à la tablette caisse (LAN) → écrite localement + événement VENTE → diffusée au KDS (`envoyée`).
5. **Préparation:** la cuisine passe le ticket `en préparation` puis `prêt` ; le terminal du serveur voit l'avancement.
6. **Encaissement:** sur la tablette caisse : carte (TPE : montant + résultat enregistrés) ou espèces (rendu calculé) ; transaction locale atomique (commande + paiements + écritures journal + ticket) ; ticket imprimé.
7. **Clôture:** commande `clôturée` ; table libérée.
8. **Fin de service:** gérant lance la **clôture Z** : totaux calculés, scellé signé, événement CLOTURE_Z, exportable, répliqué au cloud à la reconnexion.

### 8.2 Entity Lifecycle & State Transition Matrix

**Commande:**
| Current State | Trigger / Event | Allowed Actor | Next State | System Actions & Notifications |
| --- | --- | --- | --- | --- |
| `ouverte` | Envoi cuisine | Serveur / Gérant | `envoyée` | Écriture VENTE ; KDS notifié |
| `envoyée` | Démarrage préparation | Cuisine | `en préparation` | Statut propagé aux terminaux |
| `en préparation` | Marquer prêt | Cuisine | `prête` | Statut propagé ; serveur notifié |
| `prête` | Service table | Serveur | `servie` | Statut propagé |
| `servie` | Encaissement complet (tablette caisse) | Gérant / Second | `encaissée` | Écritures PAIEMENT + TICKET ; ticket imprimé |
| `encaissée` | Clôture (auto après ticket) | Système | `clôturée` | Table libérée ; verrou de modification |
| `ouverte`/`envoyée`/`prête` | Annulation (motif + second si configuré) | Serveur → Second | `annulée` | **Nouvelle écriture ANNULATION** ; rien n'est modifié |
| `servie` | Remise partielle (motif + second) | Gérant / Second | `servie` (totale ajusté) | Écriture REMISE avec validateur |

**Session utilisateur:**
| Current State | Trigger | Actor | Next State | Actions |
| --- | --- | --- | --- | --- |
| `fermée` | Matricule + PIN valides | Serveur/Gérant/Second/Cuisine | `ouverte` | Événement SESSION(journal) |
| `ouverte` | Inactivité 2–5 min (paramétrable) | Système | `verrouillée` | Rouverture PIN requise |
| `verrouillée` | PIN valide | Utilisateur | `ouverte` | — |
| `ouverte` | 5 échecs PIN | Système | `compte bloqué` | Journalisé ; déblocage gérant |

**Licence:**
| Current State | Trigger | Next State | Actions |
| --- | --- | --- | --- |
| `active` | Paiement à jour | `active` | Tout fonctionne |
| `active` | Impayé J+0 | `grace1` (J+30) | Rappels non bloquants |
| `grace1` | J+30 | `grace2` (J+60) | Fonctions cloud suspendues ; caisse locale OK |
| `grace2` | J+60 | `bloquée` | Lancement mobile bloqué ; données exportables |
| `bloquée` | Régularisation | `active` | Rétablissement immédiat, numérotation continue |

### 8.3 Exception & Error Recovery Flows

- **Perte LAN terminal→caisse:** file locale du terminal ; envoi auto au retour ; indicateur d'état permanent sur le terminal.
- **Imprimante hors service:** encaissement possible ; ticket en file d'impression avec statut ; réimpression journalisée.
- **Session expirée (back-office):** formulaire préservé, re-login sans perte de saisie.
- **Erreur serveur (500):** message générique + ID de suivi, jamais de stack trace exposée.
- **Rupture de chaînage:** encaissement refusé, incident visible, export d'incident ; correction impossible par conception (investigation).
- **Lot de sync rejeté (chaînage):** incident côté serveur ; la tablette est contactée ; aucun nettoyage silencieux du journal.

---

## 9. Data Architecture, Schemas & API Contracts

### 9.1 Data Model Dictionary

#### Entité locale (SQLite / WatermelonDB — tablette caisse): `journal_permanent`
| Column / Field | Data Type | Nullable | Constraints & Defaults | Description |
| --- | --- | --- | --- | --- |
| `seq` | integer | No | PK, auto-incrément continu | Numérotation locale continue |
| `ref` | text | No | Unique, `POSTE-01-000001` | Référence lisible (préfixe + seq) |
| `type` | text/enum | No | CHECK dans FISC-1 | Type d'événement |
| `timestamp` | integer (epoch ms) | No | Monotonic guard | Horodatage local |
| `user_matricule` | text | No | FK users(matricule) | Acteur identifié |
| `validator_matricule` | text | Yes | FK users(matricule) | Second validateur si applicable |
| `motif` | text | Yes | 3–500 chars si requis | Motif (annulation/remise/prix) |
| `payload` | text (JSON canonique) | No | Sérialisation déterministe | Détail de l'opération |
| `hash_prev` | text | No | 64 hex | Hash de l'écriture précédente |
| `hash_self` | text | No | 64 hex, unique | SHA-256(hash_prev \|\| payload) |
| `synced` | boolean | No | Default 0 | État de réplication |

*Règles : aucune UPDATE/DELETE (triggers SQLite en défense) ; l'index `(seq)` et `(ref)` sont uniques ; le démarrage de l'app vérifie la chaîne complète.*

#### Entité locale: `cloture_z`
| Field | Type | Constraints | Description |
| --- | --- | --- | --- |
| `id` | uuid | PK | Identifiant Z |
| `date_service` | date | Unique par jour/poste | Journée de service |
| `totals_ht / totals_tva / totals_ttc` | json | — | Totaux par taux |
| `nb_tickets` | integer | — | Nombre de tickets |
| `first_seq / last_seq / last_hash` | integer/text | — | Bornes de période (référence de coupure) |
| `seal_signature` | text | Vérifiée par clé publique enregistrée au cloud | Scellé signé (Keystore) |
| `synced` | boolean | Default 0 | Réplication |

#### Entités locales de service: `users` (matricule, nom, role, pin_hash, actif, version), `articles` (id, categorie, nom, prix_ttc, tva, actif, version), `commandes` (uuid, type {salle, comptoir, emporter}, statut, table_id, serveur_matricule, snapshot_prix JSON, horodatages), `commande_lignes` (uuid, commande_id, article_id, nom, qte, prix_unitaire_snapshot, total_ligne), `paiements` (uuid, commande_id, moyen {carte_tpe, especes, mixte}, montant, rendu, resultat_tpe), `sync_queue` (uuid, type, payload, statut, tentatives, dernier_essai).

#### Entité cloud (PostgreSQL): `journal_replica`
| Column | Data Type | Nullable | Constraints | Description |
| --- | --- | --- | --- | --- |
| `id` | uuid | No | PK | Identifiant d'écriture répliquée |
| `restaurant_id` | uuid | No | FK restaurants(id) | Restaurant |
| `poste` | text | No | ex. `POSTE-01` | Poste d'origine |
| `seq` | integer | No | Unique avec (restaurant_id, poste) | Numérotation d'origine |
| `ref` | text | No | Unique | Référence lisible |
| `type` | text | No | CHECK | Type d'événement |
| `timestamp` | timestamptz | No | — | Horodatage local d'origine |
| `user_matricule` | text | No | — | Acteur |
| `validator_matricule` | text | Yes | — | Validateur |
| `motif` | text | Yes | — | Motif |
| `payload` | jsonb | No | Canonique | Détail |
| `hash_prev` / `hash_self` | text | No | 64 hex | Chaînage vérifié à l'insertion |
| `uuid_op` | uuid | No | Unique avec restaurant_id | Idempotence |

*Règles : trigger PostgreSQL refusant UPDATE et DELETE ; insertion uniquement via `/api/sync/push` avec vérification du chaînage du lot.*

#### Entités cloud principales: `restaurants` (id, nom, siret, adresse, licence_id), `users_web` (id, email, password_hash, role, totp_secret_enc, actif, restaurant_id nullable pour admin plateforme), `licences` (restaurant_id, etat {active, grace1, grace2, bloquee}, dates), `articles_version` (restaurant_id, article_id, version, prix, tva, dates), `commandes_archive` (réplique commandes, lecture/export), `paiements_archive`, `clotures` (Z répliquées + scellés + signature), `archives_pdp` (restaurant_id, periode, fichier_objet, empreinte, signature), `exports` (id, demandeur, type, fichier, date), `audit_log` (actor_id, action, entity, entity_id, timestamp, diff_summary — append-only).

### 9.2 API & Server Endpoint Contracts

#### Endpoint 1: `POST /api/sync/push`
- **Description:** push des écritures du journal local + clôtures Z + commandes/payements vers le cloud (append-only, idempotent).
- **Authentication:** device token (Bearer), tablette caisse uniquement.
- **Request Body:**
```json
{
  "restaurantId": "uuid",
  "poste": "POSTE-01",
  "entries": [
    {
      "uuidOp": "uuid-device-side",
      "seq": 42,
      "ref": "POSTE-01-000042",
      "type": "PAIEMENT",
      "timestamp": "2026-11-16T12:34:56.789+01:00",
      "userMatricule": "S07",
      "validatorMatricule": null,
      "motif": null,
      "payload": { "montant": 47.5, "moyen": "carte_tpe" },
      "hashPrev": "abc…",
      "hashSelf": "def…"
    }
  ],
  "clotures": []
}
```
- **Success Response (200 OK):**
```json
{
  "accepted": 1,
  "duplicates": 0,
  "rejected": [],
  "chainVerified": true,
  "licence": { "etat": "active", "expiresAt": "2026-12-31" }
}
```
- **Error Responses:** `401 Unauthorized` (device token), `409 Conflict` (rupture de chaîne / seq invalide → lot rejeté + incident), `403 Forbidden` (licence bloquée pour le sync — données locales conservées), `500 Server Error`.

#### Endpoint 2: `POST /api/sync/pull`
- **Description:** delta des données de référence (menu, TVA, utilisateurs, tables) depuis la dernière version.
- **Authentication:** device token.
- **Query Parameters:** `since=2026-11-15T00:00:00Z`
- **Success Response (200):** `{ "articles": [...], "users": [{ "matricule": "S07", "pinHash": "$argon2…", "role": "serveur", "actif": true }], "tables": [...], "licence": {...} }`
- **Notes:** `pinHash` transmis hashé (Argon2) — jamais de PIN en clair ; validé localement sur la tablette.

#### Endpoint 3: `POST /api/auth/login` (back-office web)
- **Authentication:** e-mail + mot de passe (+ TOTP pour profils sensibles).
- **Request:** `{ "email": "gerant@local.test", "password": "...", "totp": "123456" }`
- **Success:** `200 { "session": { "jwt": "…", "refreshToken": "…", "expiresIn": 3600 } }` (cookies HttpOnly, Secure, SameSite=Lax).
- **Errors:** `401` identifiants invalides, `423` compte verrouillé, `429` rate limit.

#### Endpoint 4: `GET /api/exports/journal`
- **Description:** export complet du journal répliqué (CSV/PDF/JSON signé) pour expert-comptable / auditeur.
- **Authentication:** rôle `expert_comptable` | `auditeur` | `gerant` ; 2FA requise pour comptable/auditeur.
- **Query Parameters:** `restaurantId=…&from=…&to=…&format=csv|pdf|json`
- **Success:** `200` flux de fichier signé (empreinte + signature serveur) ; l'export est journalisé (`audit_log`).
- **Errors:** `403 Forbidden` (rôle), `400` (paramètres invalides).

#### Endpoint 5 (LAN local, tablette caisse): `POST /local/commandes`
- **Description:** un terminal de salle transmet une commande à la tablette caisse.
- **Authentication:** terminal token (provisionné à l'installation).
- **Request:** `{ "uuidOp": "…", "type": "salle", "tableId": "T12", "serveurMatricule": "S07", "lignes": [{ "articleId": "…", "qte": 2, "variantes": [], "remarque": "saignant" }] }`
- **Success:** `201 { "commandeUuid": "…", "statut": "envoyée" }`
- **Errors:** `409` (doublon UUID → déjà reçue), `401` (jeton terminal).
- **Note:** aucun endpoint de paiement n'existe sur le réseau LAN ni sur les terminaux.

### 9.3 Physical Database Implementation (PostgreSQL — cloud)

```sql
-- Migration: 0001_init.sql (extraits clés)
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    siret TEXT NOT NULL UNIQUE,
    adresse TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal_replica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    poste TEXT NOT NULL,
    seq INTEGER NOT NULL,
    ref TEXT NOT NULL UNIQUE,
    uuid_op UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('VENTE','PAIEMENT','TICKET','ANNULATION','REMISE','CHANGEMENT_PRIX','SESSION','HORLOGE','CLOTURE_Z')),
    "timestamp" TIMESTAMPTZ NOT NULL,
    user_matricule TEXT NOT NULL,
    validator_matricule TEXT,
    motif TEXT,
    payload JSONB NOT NULL,
    hash_prev TEXT NOT NULL CHECK (hash_prev ~ '^[0-9a-f]{64}$'),
    hash_self TEXT NOT NULL CHECK (hash_self ~ '^[0-9a-f]{64}$'),
    UNIQUE (restaurant_id, poste, seq),
    UNIQUE (restaurant_id, uuid_op)          -- idempotence
);

-- Append-only strict : UPDATE et DELETE interdits par la base elle-même
CREATE RULE journal_replica_no_update AS ON UPDATE TO journal_replica DO INSTEAD NOTHING;
CREATE RULE journal_replica_no_delete AS ON DELETE TO journal_replica DO INSTEAD NOTHING;

CREATE TABLE clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    date_service DATE NOT NULL,
    poste TEXT NOT NULL,
    totals JSONB NOT NULL,
    nb_tickets INTEGER NOT NULL,
    first_seq INTEGER NOT NULL,
    last_seq INTEGER NOT NULL,
    last_hash TEXT NOT NULL,
    seal_signature TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, poste, date_service)
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    diff_summary JSONB,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- RLS (défense en profondeur ; l'app utilise une connexion scoped restaurant)
ALTER TABLE journal_replica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant scoped read" ON journal_replica
    FOR SELECT USING (restaurant_id = current_setting('app.restaurant_id', true)::uuid);
ALTER TABLE journal_replica FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_journal_restaurant_ts ON journal_replica (restaurant_id, "timestamp");
CREATE INDEX idx_journal_type ON journal_replica (restaurant_id, type);
```

---

## 10. Non-Functional Requirements & Service Level Objectives

### 10.1 Web Vitals & Performance Budgets
- **LCP (back-office):** < 1,5 s ; **INP:** < 100 ms ; **CLS:** 0,00 (skeletons aux dimensions identiques).
- **API cloud:** p95 lecture < 250 ms ; p95 mutation < 400 ms.
- **Local (caisse):** écriture journal < 100 ms ; écran commande → réponse visuelle < 50 ms ; ticket imprimé < 3 s après validation du paiement.
- **KDS:** latence LAN commande→affichage < 2 s.
- **Offline-first:** 100 % des fonctions d'encaissement disponibles hors ligne ; aucune fonction d'encaissement n'appelle le cloud de manière bloquante.

### 10.2 Security Controls & Hardening
- JWT ≤ 24 h + refresh révocable ; cookies HttpOnly/Secure/SameSite=Lax ; 2FA TOTP profils sensibles.
- PIN: Argon2id hashé localement et côté serveur de référence, jamais en clair ni transmis ; verrouillage après 5 échecs journalisé.
- Injection: requêtes paramétrées via ORM (Prisma / WatermelonDB) ; zéro SQL concaténé.
- CSP stricte, sorties échappées ; CSRF: SameSite + tokens pour mutations web.
- Rate limiting: 60 req/min/IP sur auth & endpoints publics ; exports et login plus stricts.
- Chiffrement: TLS 1.2+ partout (cloud), stockage local chiffré (jetons), clés de scellé dans Android Keystore.
- Mise à jour forcée: version minimale vérifiée à chaque sync.
- Pas de secret dans le bundle client (`NEXT_PUBLIC_` audité).

### 10.3 Accessibility & Inclusivity (WCAG 2.1 AA)
- Contraste ≥ 4,5:1 (texte), ≥ 3:1 (grand texte/bordures).
- Navigateur complet au clavier sur le back-office ; focus visible.
- Cibles tactiles: ≥ 64×64 px sur la caisse (usage debout/gants), ≥ 44×44 px sur le back-office mobile.
- Sémantique + `aria-label` sur boutons icône ; la caisse tolère des polices ≥ 16 px.

### 10.4 Reliability, Fault Tolerance & Error Recovery
- Hors ligne: bandeau d'état clair (offline / N écritures à synchroniser) ; aucune perte de saisie.
- Crash de l'app ou de la tablette: reprise à l'état pré-crash (transactions + WAL + contrôle de chaînage au démarrage).
- Sauvegardes PostgreSQL quotidiennes + rétention 6 ans + tests de restauration réguliers ; restauration d'un dump sans perte de journal.
- Supervision: logs centralisés, alertes (échec de chaînage, échec de sync > 24 h, stockage > 80 %).

### 10.5 Audit Trail & Mutation Logging
- Journal fiscal: conforme NF525 (utilisateur, horodatage, motif, validateur) — append-only par construction et par la base.
- Audit back-office: toute modification (menu, utilisateurs, paramètres) enregistre acteur, entité, timestamp, diff ; append-only.
- Exports et connexions journalisés.

---

## 11. Third-Party Integrations & External Services

| External Service | Category / Function | Integration Method | Auth / Credentials | Fallback Strategy if Unavailable |
| --- | --- | --- | --- | --- |
| **TPE (terminal de paiement bancaire)** | Paiement carte | Terminal externe, hors intégration v0.1 ; montant + résultat enregistrés | N/A (contrat banque du restaurant) | Encaissement espèces / report ; saisie manuelle résultat journalisée |
| **Imprimantes ESC/POS** | Ticket de caisse / ticket cuisine | Impression directe depuis React Native — Bluetooth, USB OTG, TCP/IP :9100, découverte mDNS (module IMP 7.9) | Appairage local / IP+port | File d'impression persistante + réimpression auto au retour ; journal écrit **avant** l'envoi à l'imprimante |
| **SMTP (ex. serveur du VPS / Mailjet)** | Invitations, 2FA par e-mail, rappels licence | REST/API SMTP | `SMTP_URL` (server secret) | File + retry ; rappels non bloquants |
| **NTP / horloge serveur** | Contrôle d'horloge (FISC-4) | Comparaison au premier contact serveur | N/A | Sans réseau : garde monotone locale seule |
| **Supervision (logs/alertes)** | Exploitation | Logs Docker + agent d'alerte sur le VPS | Server secret | Alertes locales + e-mail |

---

## 12. UI Contract & Design System Blueprint (Image Attachments)

### 12.1 Image References & Visual Strategy
| Item | Specification |
| --- | --- |
| **Fidelity Mode** | `Mood-only` (aucune référence fournie — direction proposée par l'agent, A9 = A) |
| **Reference Files** | `projects/CaisseFlow/refs/` (vide à ce stade) |
| **Target Device Orientation** | Tablette caisse/terminaux: Android paysage 1280×800 (fixe). Back-office: Desktop master 1440px, responsive 360→1920px |
| **Extracted Elements** | — |
| **Replaced / Localized Elements** | Langue: français ; monnaie: EUR ; mentions légales NF525 sur tickets |
| **Copyright & Legal Protection** | Assets originaux uniquement ; aucun logo/tiers reproduit |

### 12.2 Design DNA & Aesthetic Archetype
| Visual Dimension | Specification | Reference Standard |
| --- | --- | --- |
| **Design Language** | SaaS professionnel clair ; caisse = POS épuré à gros éléments, contraste élevé, sans distractions | Modern Minimalist SaaS + conventions POS métier |
| **Information Density** | Caisse/KDS: Comfortable POS (lignes 64 px, cibles ≥ 64 px). Back-office: Standard (44 px) | Dictionary: Standard/Compact par surface |
| **Grid Architecture** | Back-office: 12 col desktop / 8 tablet / 4 mobile (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`). Caisse: grille fixe plein écran, panneau catégories (25 %) + articles (75 %) | 360–1920px sans scroll horizontal racine |
| **Corner Radius Scale** | Concentrique: carte 16px, bouton 8px, pill 24px | r_inner = r_outer − padding |
| **Shadow System** | `shadow-sm` base, `shadow-md` flottant (modals, panier) | Ambient + Key Light |
| **Visual Anti-Slop** | Fond clair par défaut, pas de dégradés violets, pas d'emoji comme icônes, pas d'`alert()` navigateur | Zero AI Slop Compliance |

### 12.3 3-Tier Color Token Map
| Token Role | Semantic Class | Hex Code | Usage |
| --- | --- | --- | --- |
| Canvas Background | `bg-slate-50` | `#F8FAFC` | Fond racine (back-office) ; caisse: `#0F172A` neutre sombre réservé aux panneaux passifs — **pas de dark mode complet** |
| Surface Card | `bg-white` | `#FFFFFF` | Cartes, panneaux, modals |
| Surface Hover | `bg-slate-100` | `#F1F5F9` | Lignes de tableau, états repos |
| Border / Hairline | `border-slate-200/80` | `#E2E8F0` | Bordures 1px |
| Primary Brand Accent | `bg-blue-600 text-white` | `#2563EB` | CTA principaux (Encaisser, Valider) — accent identifiable CaisseFlow |
| Primary Hover | `hover:bg-blue-700` | `#1D4ED8` | Interaction principale |
| Secondary Accent | `text-slate-900 bg-slate-100` | `#0F172A` | Actions secondaires |
| Typography Heading | `text-slate-900` | `#0F172A` | Titres |
| Typography Body | `text-slate-700` | `#334155` | Corps, cellules |
| Typography Muted | `text-slate-500` | `#64748B` | Horodatages, aides |
| Semantic Success | `bg-emerald-50 text-emerald-700` | `#10B981` | Encaissé, prêt (KDS), chaînage OK |
| Semantic Warning | `bg-amber-50 text-amber-700` | `#F59E0B` | Hors ligne, N écritures à synchroniser, licence grace |
| Semantic Danger | `bg-rose-50 text-rose-700` | `#EF4444` | Annulation, rupture de chaînage, blocage |

### 12.4 Screen Inventory & 4-State Coverage

**Surface A — Tablette caisse (paysage 1280×800):**
| Screen ID | Screen Name | Route (in-app) | Access Role | Main Components | 4-State Specifications |
| --- | --- | --- | --- | --- | --- |
| `C-01` | Connexion PIN | `/login` | Tous (mobile) | Matricule + pavé PIN, bandeau sync/licence | Default ; skeleton raccourcis ; Empty (aucun utilisateur actif → alerte gérant) ; Error (PIN erroné X/5, compte bloqué) |
| `C-02` | Plan de salle | `/salle` | Gérant, Second, Serveur | Grille tables par salle, statuts couleurs, comptoir/emporter CTA | Default ; skeleton tables ; Empty (salle vide → créer tables) ; Error (sync échouée → bandeau retry) |
| `C-03` | Commande | `/commande/:uuid` | Gérant, Second, Serveur | Panier bas fixe, catégories/articles 64px, remarques, en-cours | Default ; skeleton articles ; Empty (menu vide) ; Error (article indisponible, toast) |
| `C-04` | Paiement | `/paiement/:uuid` | **Gérant, Second uniquement** | Choix moyen, TPE montant/résultat, espèces + rendu, fractionné | Default ; — ; Empty (commande déjà encaissée → zero-state) ; Error (TPE indisponible → espèces/report) |
| `C-05` | Ticket & confirmation | `/ticket/:uuid` | Gérant, Second | Ticket rendu, réimpression (journalisée), retour table | Default ; — ; Empty (n/a) ; Error (imprimante HS → file d'attente) |
| `C-06` | Clôture Z | `/cloture` | Gérant, Second | Totaux par TVA, contrôle caisse, scellé, export | Default ; skeleton totaux ; Empty (aucune vente → Z à 0 autorisée) ; Error (Z déjà faite) |
| `C-07` | Journal local (lecture) | `/journal` | Gérant, Second | Recherche seq/référence, vue écritures, indicateur chaînage | Default ; skeleton lignes ; Empty (aucune écriture) ; Error (rupture chaînage → incident bloquant) |
| `C-08` | Admin kiosque | `/admin` | Gérant (code admin) | Sortie kiosque, sync forcé, extrusion données, version | Default ; — ; Empty (—) ; Error (code invalide) |
| `C-09` | Configuration imprimantes | `/imprimantes` | Gérant, Second | Découverte (BT/mDNS), USB, IP:port, test d'impression, files en attente, modèle de ticket | Default ; skeleton découverte ; Empty (aucune imprimante → CTA ajout) ; Error (test d'impression échoué) |

**Surface B — Terminaux serveurs (paysage 1280×800):**
| Screen ID | Screen Name | Route | Access Role | Main Components | 4 States |
| --- | --- | --- | --- | --- | --- |
| `T-01` | Connexion PIN | `/login` | Serveur | Matricule + PIN | Default ; skeleton ; Empty ; Error (caisse injoignable → file locale) |
| `T-02` | Prise de commande | `/commande` | Serveur | Même grille que C-03, **sans bouton paiement (absent du binaire)** | Default ; skeleton ; Empty ; Error (envoi échoué → file) |
| `T-03` | Suivi commandes | `/suivi` | Serveur | Statuts cuisine par commande | Default ; skeleton ; Empty (aucune commande) ; Error (perte LAN) |

**Surface C — KDS cuisine (paysage 1280×800):**
| Screen ID | Screen Name | Route | Access Role | Main Components | 4 States |
| --- | --- | --- | --- | --- | --- |
| `K-01` | Connexion PIN | `/login` | Cuisine | Matricule + PIN | 4 états idem T-01 |
| `K-02` | Tickets cuisine | `/kds` | Cuisine | Colonnes nouveau/en cours/prêt, minuteur, **sans prix** | Default ; skeleton ; Empty (aucun ticket) ; Error (perte LAN → bandeau) |

**Surface D — Back-office web (Next.js, 360→1920px):**
| Screen ID | Screen Name | Route | Access Role | Main Components | 4 States |
| --- | --- | --- | --- | --- | --- |
| `S-01` | Connexion | `/login` | Tous web | Email, mot de passe, TOTP si requis | Default ; skeleton ; Empty (—) ; Error (401, 423, 429 explicites) |
| `S-02` | Dashboard | `/dashboard` | Gérant, Comptable, Auditeur, Admin | KPI ventes du jour, état sync postes, état licence, alertes | Default ; skeleton cards ; Empty (aucune vente) ; Error retry |
| `S-03` | Menu & TVA | `/menu` | Gérant | Catégories, articles, prix, TVA, disponibilité, versions | Default ; table skeleton ; Empty menu → CTA création ; Error toast |
| `S-04` | Utilisateurs & droits | `/utilisateurs` | Gérant, Admin | Table matricules, rôles, plafonds, invitation PIN | Default ; skeleton ; Empty ; Error |
| `S-05` | Tables & salles | `/tables` | Gérant | Grille éditable | Default ; skeleton ; Empty ; Error |
| `S-06` | Rapports de ventes | `/rapports` | Gérant, Comptable, Auditeur | Filtres période, totaux par TVA, par serveur, graphiques | Default ; skeleton ; Empty période ; Error |
| `S-07` | Journal répliqué (lecture) | `/journal` | Gérant, Comptable, Auditeur | Recherche, filtres, vue chaînage | Default ; skeleton ; Empty ; Error |
| `S-08` | Exports & archives | `/exports` | Comptable, Auditeur, Gérant | Sélection période/format, historique exports, scellés | Default ; skeleton ; Empty ; Error (échec export) |
| `S-09` | Licence | `/licence` | Gérant, Admin | État, échéances, historique dégradation | Default ; skeleton ; Empty ; Error |
| `S-10` | Audit logs | `/audit` | Gérant, Comptable, Auditeur, Admin | Table append-only, filtres | Default ; skeleton ; Empty ; Error |
| `S-11` | Modèle de ticket | `/ticket-modele` | Gérant | Éditeur de modèle (logo, mentions), aperçu, champs légaux verrouillés | Default ; skeleton aperçu ; Empty (modèle par défaut) ; Error (aperçu impossible) |

### 12.5 Interactive Components & Micro-interactions
- **Buttons (6 states) — caisse:** hauteur 64px, `rounded-lg`, primary `bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold text-lg` ; secondary contour ; destructive `bg-rose-600` (annulations) toujours avec confirmation par PIN/motif.
- **Buttons — back-office:** hauteur 40px selon gabarit du dictionnaire (primary/secondary/destructive, focus-visible ring 2px).
- **Inputs:** `h-10 px-3 bg-white border border-slate-300 focus:ring-2 focus:ring-blue-600 rounded-lg text-sm` ; PIN: pavé numérique plein écran, haptique.
- **Data table (BO):** texte aligné à gauche ; montants alignés à droite `font-mono tabular-nums` ; hover `bg-slate-50/80` ; colonne actions collée à droite.
- **Feedback:** toasts en haut à droite (succès 3 s, erreur jusqu'à action) ; bandeau permanent offline/sync/licence sur les surfaces mobiles ; pas d'`alert()`.

### 12.6 Navigation Architecture & Responsive Adaptation
- **Back-office desktop (≥1024):** sidebar fixe `w-64` (Dashboard, Menu, Utilisateurs, Tables, Rapports, Journal, Exports, Licence, Audit) + topbar (recherche, profil).
- **Back-office tablette (768–1023):** sidebar repliable.
- **Back-office mobile (<768):** bottom nav 3–5 onglets (Dashboard, Menu, Rapports, Exports) + `<main class="pb-24">`.
- **Caisse/terminaux/KDS:** navigation par écrans plein-fenêtre + barre d'état permanente (connexion, sync, licence) ; aucun scroll racine horizontal de 360→1920px (BO).

---

## 13. Local Test Plan & Acceptance Criteria

### 13.1 Local Commands & Quality Verification
```bash
bash scripts/test-local.sh CaisseFlow --check          # backend web + API
bash scripts/qa-check.sh CaisseFlow
bash scripts/security-audit.sh CaisseFlow
# Mobile (local): build + tests unitaires RN + tests d'intégration SQLite/journal
cd projects/CaisseFlow/app/mobile && npm run test
```

### 13.2 Deterministic Demo Accounts & Test Seed Matrix
| Rôle | Compte | Secret (local dev) | État initial |
| --- | --- | --- | --- |
| Gérant (web + tablette) | `gerant@local.test` / matricule `MGR` | `Gerant123!` / PIN `1234` | Menu + tables seedés, licence active |
| Second | matricule `SEC` | PIN `2345` | Valide annulations/remises |
| Serveur | matricule `S07` | PIN `3456` | Terminal associé |
| Cuisine | matricule `K01` | PIN `4567` | KDS sans prix |
| Expert-comptable | `comptable@local.test` | `Compta123!` + TOTP seed | Lecture + exports |
| Auditeur | `auditeur@local.test` | `Audit123!` + TOTP seed | Lecture + exports |
| Admin plateforme | `admin@local.test` | `Admin123!` | Licences, restaurants |

### 13.3 Test Cases & Verification Scenarios (cartographie A10)
| Test ID | Groupe A10 | Scénario | Attendu |
| --- | --- | --- | --- |
| `T-FISC-01` | §1 | Encaissement complet en mode avion | Ticket + écritures journal, chaînage OK |
| `T-FISC-02` | §2 | Aucune interface ne modifie/supprime le journal | Append-only vérifié (UI, API, triggers) |
| `T-FISC-03` | §3 | Altération manuelle d'une ligne locale | Chaînage SHA-256 détecte, encaissement refusé |
| `T-FISC-04` | §4 | Annulation (motif+PIN+second) | Nouvelle écriture, validateur, total recalculé |
| `T-FISC-05` | §5 | Remise / changement de prix | Journalisé utilisateur+horodatage+motif |
| `T-FISC-06` | §6 | Recul de l'heure système | Bloqué ou journalisé, chronologie intacte |
| `T-FISC-07` | §7 | Clôture Z locale | Scellé signé, exportable, répliqué |
| `T-SYNC-01` | §8 | 3 jours hors ligne | Encaissement + clôtures OK, numérotation continue |
| `T-SYNC-02` | §9 | Deux tablettes hors ligne | Aucune collision POSTE-01/02 |
| `T-SYNC-03` | §10 | Reconnexion, renvoi double (UUID) | Une seule écriture, réplique identique |
| `T-SYNC-04` | §11 | Crash brutal en pleine vente | Aucune perte, journal cohérent |
| `T-SYNC-05` | §12 | Redémarrage app + tablette | Données présentes |
| `T-SEC-01` | §13 | RBAC profil par profil (6 profils) | Chacun ne voit/fait que ses droits |
| `T-SEC-02` | §14 | Verrouillage inactivité | Session rouvre par PIN |
| `T-SEC-03` | §15 | 5 échecs PIN | Blocage + journalisation |
| `T-SEC-04` | §16 | PIN hashé | Argon2 local, jamais transmis en clair |
| `T-SEC-05` | §17 | Terminaux sans paiement | Techniquement désactivé (UI+API+binaire) |
| `T-BO-01` | §18 | Export comptable (lecture seule) | CSV/PDF/JSON signé téléchargé |
| `T-BO-02` | §19 | Contrôle fiscal simulé | Journal + archives reconstituables par un auditeur |
| `T-BO-03` | §20 | Rétention 6 ans | Aucune purge avant échéance |
| `T-BO-04` | §21 | Restauration dump PostgreSQL | Sans perte de journal |
| `T-OPS-01` | §22 | Installation APK < 10 min | Procédure documentée suivie |
| `T-OPS-02` | §23 | Mode kiosque | Sortie impossible sans code admin |
| `T-OPS-03` | §24 | Version trop ancienne | Refusée avec message clair |
| `T-OPS-04` | §25 | Impayé J+30 | Cloud coupé, caisse locale OK |
| `T-OPS-05` | §26 | Impayé J+60 | Lancement bloqué, données exportables |
| `T-TERR-01` | §27 | Service complet réel (pilote) | Commande→cuisine→encaissement→annulation→clôture |
| `T-TERR-02` | §28 | Usage à une main, debout | Test serveur en conditions réelles |
| `T-IMP-01` | §1 (amendement) | Mode avion + imprimante Bluetooth appairée | Écriture journal d'abord, ticket imprimé, IMPRESSION journalisé |
| `T-IMP-02` | Résilience (amendement) | Imprimante débranchée pendant encaissement | Écriture fiscale enregistrée, file conserve le ticket, impression auto au rebranchement, statuts journalisés |
| `T-GEN-01` | Auth back-office | Connexion valide / invalide | Redirect dashboard / erreur 401 |
| `T-GEN-02` | RBAC web | Serveur→écran admin | 403 |
| `T-GEN-03` | Responsive | 360×844 | Bottom nav, zéro scroll horizontal racine |

### 13.4 Strict Definition of Done Checklist
- [ ] Tous les écrans du 12.4 s'ouvrent sans erreur console.
- [ ] Toute exigence **Mandatory** du 7 vérifiée fonctionnellement (y compris module IMP 7.9 : T-IMP-01, T-IMP-02).
- [ ] A10 (amendée) : points **1–12, 18–21, 27** + test d'impression offline/de l'amendement IMP validés sans anomalie ⇒ mise en production autorisée ; échec sur 1–7 ou 8–10 ⇒ non conforme, pas de mise en production.
- [ ] Responsive 360/768/1024/1440px zéro scroll horizontal racine (back-office) ; POS 1280×800 vérifié.
- [ ] Aucun bouton mort : chaque élément interactif déclenche une action visible.
- [ ] Zéro secret dans le bundle client (`NEXT_PUBLIC_` audité propre).
- [ ] `qa-check.sh` et `security-audit.sh` exit 0 (zéro FAIL).
- [ ] Aucun gabarit de placeholder restant dans ce PRD (vérification grep vide).

---

## 14. Proposed Features / Later Phase (Post-MVP Roadmap)

> **Ajout du 2026-11-17** — deux évolutions demandées et validées au backlog (phase 2, après le socle RN) :
> **F1. Gestion des catégories** et **F2. Photos des articles** — analyse RBAC détaillée ci-dessous.
> Rattachées à l'exigence **BO-1** (Gestion menu). **Non implémentées en v0.1.**

### 14.1 [BACKLOG F1] Gestion des catégories (BO-1.x)

Créer, modifier, archiver/supprimer des catégories et les associer aux articles du menu.

**Droits RBAC (alignés sur la ligne « Menu / Articles / TVA » de § 3.2 — la catégorie est une sous-entité du menu) :**

| Action | Gérant | Second | Serveur / Cuisine | Expert-comptable / Contrôleur | Admin plateforme | Public |
| --- | --- | --- | --- | --- | --- | --- |
| Créer une catégorie | **C** | — | — | — | — | Denied |
| Lire / lister (menu, sync pull) | R | R | R | R | — | Denied |
| Modifier (nom, ordre, salle) | **U** | — | — | — | — | Denied |
| Associer/dissocier un article | **U** (via article) | — | — | — | — | Denied |
| Archiver (désactiver) | **U** | — | — | — | — | Denied |
| Supprimer définitivement | **D** (si vide) | — | — | — | — | Denied |

**Restrictions :**
- **Suppression refusée si la catégorie contient des articles** (contrainte FK + contrôle applicatif → `400` explicite). Parcours attendu : archiver (`actif = false`) ou ré-associer les articles d'abord.
- Une catégorie archivée reste en base (les exports/rapports historiques gardent leur cohérence), disparaît des listes de sélection et du `sync pull`.
- Renommage propagé aux tablettes au prochain `sync pull` (pas de push forcé — offline-first).
- La modification d'un **prix** pendant le service reste un événement journal `CHANGEMENT_PRIX` (POS-7, validateur second) — elle n'est pas concernée par cette fonctionnalité.

**Journalisation :** **`audit_log`** (acteur, horodatage, action, id catégorie, restaurant) — **pas** `journal_replica` : la gestion du menu n'est pas un événement fiscal NF525 (aucune VENTE/PAIEMENT/ANNULATION en jeu). Règle inchangée : le journal fiscal ne trace que la chaîne d'encaissement.

**Points techniques :** endpoint `GET/POST /api/categories` + `PATCH/DELETE /api/categories/[id]` (CSRF `assertSameOrigin`, re-validation serveur du DTO — pattern `packages/shared`) ; colonne `actif` sur `categories` (migration SQL versionnée, pattern 0002) ; DTO `validateCategory` dans `@caisseflow/shared` (2–40 caractères) ; guard « non vide » en SQL (`SELECT COUNT(*)` en transaction) ; écran BO `/menu` — panneau latéral catégories (gérant) + lecture dans sync pull.

### 14.2 [BACKLOG F2] Photos des articles (BO-1.x)

Ajouter, remplacer et supprimer une photo par article, avec stockage persistant et affichage (menu BO + tablettes via sync).

**Droits RBAC (la photo est un attribut éditorial de l'article — même ligne « Menu » de § 3.2) :**

| Action | Gérant | Second | Serveur / Cuisine | Expert-comptable / Contrôleur | Admin plateforme | Public |
| --- | --- | --- | --- | --- | --- | --- |
| Ajouter / remplacer une photo | **C,U** | — | — | — | — | Denied |
| Supprimer la photo | **D** | — | — | — | — | Denied |
| Afficher la photo (BO + POS/KDS/TERM) | R | R | R | R(export si inclus) | — | Denied |

**Restrictions :**
- **Formats** : JPEG/PNG/WebP uniquement — validation serveur par **magic bytes** (jamais le `Content-Type` du client, jamais le nom de fichier).
- **Taille** : ≤ 2 Mo ; dimensions ≤ 2048 px — redimensionnement/re-encodage côté serveur (dans le conteneur) + vignette 512 px générée pour les listes.
- **Nom de fichier** : généré aléatoirement côté serveur (UUID) — le nom fourni par le client n'est jamais conservé (injection de chemin, XSS via nom).
- **Stockage** : répertoire de données persistant monté en **volume Docker** (dev) / volume Dokploy ou stockage objet S3-compatible (prod) ; chemin référencé en base (`articles.photo_url` — migration SQL versionnée). **PAS sur l'hôte** : données applicatives, pas des fichiers d'exploitation (voir README « Arborescence et fichiers modifiables »).
- **Remplacement** : l'ancienne photo est archivée puis purgée (rétention 30 j) — jamais écrasée en place, pour laisser le temps aux tablettes de re-télécharger via cache ETag.
- **Suppression** : fichier retiré + `photo_url` = NULL ; les **exports fiscaux ne sont pas affectés** (les archives exportent noms/prix/TVA, pas les photos) ; entrée `audit_log`.
- Tablette **hors ligne** : la photo est téléchargée au `sync pull` et mise en cache local (clé ETag = hash du fichier) — le menu reste utilisable sans réseau, photo optionnelle.

**Journalisation :** **`audit_log`** (comme F1) — hors périmètre fiscal NF525 ; aucune écriture `journal_replica`.

**Points techniques :** `POST/DELETE /api/articles/[id]/photo` (multipart, CSRF, gérant only) ; service du fichier par route authentifiée (pas de listing public) ; migration 0005 (`photo_url TEXT NULL`, `photo_hash TEXT NULL`) ; lib partagée `@caisseflow/shared` : limites de taille/dimensions comme constante unique ; génération de vignettes via lib de traitement d'image exécutée dans le conteneur.



- **Commande client par QR code:** le client commande depuis son téléphone et paie à table (Phase 2) ; les commandes client arrivent sur la tablette caisse comme les commandes serveur, même chaîne fiscale.
- **Gestion de stock:** décrément des articles cuisinés, alertes de rupture (remonte aux 3–5 restaurants).
- **Intégration TPE directe:** pilotage du terminal de paiement depuis la caisse (retour automatique du résultat).
- **Notifications enrichies:** push multi-canaux (prêt en cuisine, synthèse de fin de service par e-mail).
- **iPad / multi-plateformes:** selon demande du parc (année 2).
- **Exports PDF périodiques automatiques:** envoi mensuel automatique à l'expert-comptable.

### 14.3 [IMPLÉMENTÉ v0.4] Bibliothèque média (réutilisation des images)

- **Besoin** : réutiliser une image déjà téléversée sans la recharger — le champ photo de l'article propose deux modes : « Téléverser une image » (nouveau fichier) et « Choisir dans la bibliothèque » (modale type WordPress/media picker : grille de vignettes, badge d'usage « ×n », badge « Active » sur la vignette courante, recherche, téléversement possible depuis la modale, fermeture Échap/clic extérieur).
- **Modèle** : table `media` par restaurant (migration `0008_media.sql`, backfill des photos F2 existantes) ; **déduplication par hash SHA-256** — un même contenu n'est stocké qu'une fois (upload en double → `200 {dedup:true}`, aucun nouveau fichier). Les articles référencent le **contenu** (`photo_file`/`photo_hash` dénormalisés, pas de FK) : le cycle de vie de l'asset est indépendant de l'article.
- **Cycle de vie** : retirer la photo d'un article = simple **déliaison** (l'asset reste réutilisable) ; supprimer un asset utilisé par un article est **refusé** (`400 {nb_articles}`) ; un asset libre est archivé 30 j (même rétention que les photos).
- **Droits** : lecture tout le personnel connecté du restaurant ; téléversement/assignation/suppression gérant + gate licence (LIC-4 : lecture jamais verrouillée).
- **Compatibilité** : aucun impact tablette — les photos continuent d'être servies via `/api/articles/[id]/photo` (ETag SHA-256 + 304 inchangés) ; aucun impact offline.
- **Tests** : TC-MED 16/16 PASS (TEST-PLAN § 23).

### 14.4 [IMPLÉMENTÉ v0.4] Aperçu du ticket (WYSIWYG 58 mm)

- **Besoin** : voir le rendu approchant du ticket pendant l'édition du modèle — standard WYSIWYG de tout éditeur de modèle d'impression.
- **Réalisation** : composant `TicketPreview` intégré sous le formulaire de `/ticket-modele` — ticket papier 58 mm (~224 px, police monospace, séparateurs pointillés, style imprimante thermique ESC/POS) mis à jour **en direct** pendant la saisie du logo et des mentions.
- **Mentions légales NF525** : rendues en **données d'exemple figées** (SIRET, récap TVA par taux, TOTAL TTC, empreinte, clôture Z signée) — elles sont imprimées par la caisse, jamais configurables ; l'aperçu ne remplace pas le rendu réel à l'impression (bandeau explicite).
- **Tests** : TC-TKT 3/3 PASS (TEST-PLAN § 24).

## 15. Explicitly Rejected Features (Scope Guardrails)

- **Modification ou suppression d'écritures fiscales:** rejetée par conception — viole l'inaltérabilité NF525 ; toute correction est une nouvelle écriture.
- **Paiement client en ligne (Stripe etc.) en v0.1:** ajoute un périmètre réglementaire et technique hors cœur MVP ; Phase 2.
- **Distribution Play Store:** refusée pour l'app fiscale (dépendance à une boutique, blocage possible) — distribution directe APK/MDM retenue.
- **Mode anonyme / kiosque sans identification:** rejeté — NF525 exige la traçabilité nominative de chaque opération.
- **Dark mode:** refusé pour l'instant (convention du projet ; la caisse reste claire et contrastée).
- **Gestion du stock en v0.1:** repoussée en Phase 2 pour concentrer l'effort sur la conformité fiscale et le cœur d'encaissement.

## 16. Open Questions & Technical Spikes (TBD)

- **Modèle d'imprimante cible (ESC/POS):** à confirmer avec le restaurant pilote (Bluetooth vs USB) — statut: à valider avant Phase 3 codegen print.
- **Moyen d'extrusion des données en cas de blocage J+60:** mécanisme d'export local de dernier recours (câble USB / QR code signé / fichier) — à définir précisément en conception.
- **Choix final du fournisseur VPS (Hetzner vs OVH vs Scaleway):** équivalents fonctionnellement — décision d'achat client.
- **Revise juridique de la clause de dégradation (CGV):** recommandée par un professionnel du droit avant la mise en production — hors périmètre technique.
- **Pilote TPE:** modèle du terminal du restaurant et flux exact (impression du ticket TPE, accord) — à observer en terrain.
- **Modèle d'imprimante cible V1 (module IMP):** recommandation — **Xprinter XP-P323B** (Bluetooth) + **Epson TM-T20III** (réseau) pour les tests ; validation avec le restaurant pilote.
- **Bibliothèque React Native ESC/POS:** `react-native-bluetooth-escpos-printer`, `react-native-thermal-receipt-printer`, ou équivalent maintenu — évaluation en Phase 3 (maintenance, couverture BT/USB/TCP).
- **Paramètres précis du contrôle d'horloge (seuils, stratégie de resynchronisation progressive):** finalisés en conception technique (default: 60 s).

## 17. Project Glossary & Domain Terms

- **NF525:** norme française de certification des logiciels d'encaissement ; implémente les exigences de l'article 286 I-3° du CGI (ISCA). Une amende de 7 500 € par poste non conforme s'applique.
- **ISCA:** Inaltérabilité, Sécurisation, Conservation, Archivage — les quatre exigences légales des données d'encaissement.
- **Journal Permanent:** journal des enregistrements exigé par NF525 ; liste chronologique inaltérable de toutes les opérations d'encaissement (ventes, annulations, remises, clôtures…).
- **Chaînage SHA-256:** chaque écriture intègre l'empreinte de la précédente ; toute modification d'une écriture casse la chaîne et devient détectable.
- **Append-only:** écriture seule — les enregistrements ne peuvent jamais être modifiés ou supprimés.
- **Clôture Z:** clôture journalière de caisse ; produit totaux et scellé signé servant de référence de période.
- **PDP:** récapitulatif périodique détaillé (fichier NF525 listant toutes les opérations d'une période).
- **Scellé:** empreinte signée (clé asymétrique de l'appareil) des totaux de clôture, vérifiable par une clé publique enregistrée au cloud.
- **Poste fiscal:** appareil habilité à encaisser et à journaliser ; CaisseFlow en compte exactement un : la tablette caisse.
- **Kiosque:** mode Android verrouillé ne permettant de sortir de l'application qu'avec un code administrateur.
- **KDS:** Kitchen Display System — écran cuisine de suivi des préparations, sans prix.
- **Idempotence:** renvoyer la même opération (même UUID) ne la duplique jamais.
- **TPE:** terminal de paiement électronique (bancaire), externe à CaisseFlow en v0.1.
- **RBAC:** Role-Based Access Control — contrôle d'accès par rôles.
- **RLS:** Row Level Security — sécurité au niveau des lignes PostgreSQL.
- **CLS:** Cumulative Layout Shift — stabilité visuelle (cible 0,00).
- **Dokploy:** orchestrateur de déploiement Docker auto-hébergé (VPS).

---

*This document serves as the formal specification and binding engineering contract for CaisseFlow. Subsequent phases (Phase 2 UI Design, Phase 3 Codegen, Phase 4 Local Testing, and Phase 4.5 Security Gate) must adhere strictly to the requirements defined herein.*
