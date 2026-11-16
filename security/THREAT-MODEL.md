# Modèle de menace — CaisseFlow (`pos-nf525`)

Source de vérité : `prd/PRD-v0.1.md` (chapitres 9 modèle de données, 10 exigences
non fonctionnelles, 12 écrans). Cible : `app/` uniquement, environnement local,
comptes fictifs du seed. Aucun test contre un déploiement, un tiers, ou des
données réelles (règles d'engagement du workflow/06 §1).

## 1. Actifs

| Actif | Valeur | Localisation |
| --- | --- | --- |
| Journal fiscal répliqué (`journal_replica`) | Élevée — preuve fiscale NF525, chaînage SHA-256, 6 ans | PostgreSQL (table append-only, règles SQL) |
| Clôtures Z signées (`clotures`) | Élevée — cachet journalier | PostgreSQL (append-only) |
| Empreintes d'exports (`exports`) | Moyenne — attestent ce que l'expert-comptable a reçu | PostgreSQL + fichiers `app/var/exports/` |
| Sessions back-office (`sessions`) | Élevée — accès complet aux données du restaurant | PostgreSQL (token hashé SHA-256) |
| Jetons d'appareil (`device_tokens`) | Élevée — droit d'écriture sur le journal | PostgreSQL (token hashé) |
| PIN et mots de passe (`users_mobile.pin_hash`, `users_web.hashedPassword`) | Personnels/secret | bcrypt cost 10 |
| Piste d'audit (`audit_log`) | Élevée — preuve d'actions (repudiation) | PostgreSQL (append-only) |
| État de licence (`licences`) | Moyenne — pilote la dégradation de service | PostgreSQL |
| Disponibilité du service | Moyenne — VPS Dokploy en production | hors périmètre des tests |

## 2. Acteurs

| Acteur | Authentification | Droits |
| --- | --- | --- |
| Visiteur anonyme | aucun | `/login` uniquement ; pages protégées rendent un état « session requise » (HTTP 200) |
| Gérant (web) | e-mail + mot de passe (+ TOTP optionnel) | tout sur son restaurant, hors gestion de licence |
| Expert-comptable / Auditeur (web) | e-mail + mot de passe | lecture rapports/journal/audit, exports seulement |
| Admin plateforme (web) | e-mail + mot de passe | gestion de licence, audit ; pas d'accès aux données fiscales d'un restaurant |
| Tablette caisse (`POSTE-01`) | Bearer token d'appareil | push/pull de son restaurant uniquement |
| Autre tenant (restaurant) | ses propres sessions | ne doit rien voir du restaurant A |
| Administrateur système / insider | accès serveur | hors périmètre applicatif, couvert par la sécurité VPS |

## 3. Frontières de confiance

1. **Navigateur → API Next.js** : session cookie `HttpOnly SameSite=Lax Secure(prod)` ; contrôle d'origine sur toute mutation (`lib/http.js assertSameOrigin`).
2. **Tablette caisse → API** : Bearer token, hashé en base ; écrivain unique du journal.
3. **API → PostgreSQL** : requêtes paramétrées (`pg`), scoping `restaurant_id` systématique ; règles SQL append-only sur `journal_replica`, `clotures`, `audit_log`.
4. **Admin plateforme → tenant** : l'admin n'a pas de `restaurant_id` ; les données fiscales ne lui sont pas exposées par les pages RBAC.
5. **App → disque (`app/var/exports/`)** : noms de fichiers générés serveur (UUID), lecture avec `path.basename` + vérification du préfixe de répertoire.
6. **Déploiement (production)** : TLS termination, reverse proxy, réplication PostgreSQL — faits de déploiement, hors source : traités en `needs_validation`.

## 4. Classes de données

| Classe | Exemples | Stockage | Journalisation |
| --- | --- | --- | --- |
| Public | nom de la carte affichée | — | — |
| Interne | totaux, KPI, tables | PostgreSQL, scoped par tenant | jamais de valeurs dans les logs applicatifs |
| Personnel | e-mails, noms, matricules, PIN hashés | PostgreSQL (bcrypt pour PIN/mdp) | absent des logs |
| Secret | `DATABASE_URL`, sessions, jetons d'appareil, `totp_secret` | `.env` racine projet (gitignore), hash en base | jamais loggé |

## 5. Passage STRIDE (par frontière)

| Frontière | S | T | R | I | D | E |
| --- | --- | --- | --- | --- | --- | --- |
| Navigateur→API | vol de session (cookie HttpOnly, TTL 24 h, révocation logout) | falsification requête (origine vérifiée, JSON validé) | piste d'audit `audit_log` append-only par action | réponses JSON sans HTML brut | limiteur mémoire + lockout DB sur login | RBAC matrice `lib/auth.js can()` côté serveur |
| Tablette→API | spoof de poste (token aléatoire hashé) | réécriture du journal (chaînage SHA-256 vérifié à l'insert, idempotence UUID) | ref/uuid + horloge journalisées | pull ne renvoie que le tenant du token | lot borné, transactionnel | un poste ne pousse que son propre journal |
| API→DB | — | injection SQL (100 % paramétré, pas de concat de valeurs) | — | isolation tenant par `restaurant_id` dans chaque requête | pas de UPDATE/DELETE possible sur les 3 tables fiscales (règles SQL) | rôles applicatifs limités aux droits de la connexion |
| Admin→tenant | compte admin dédié | état de licence audité | audit | admin sans accès aux données fiscales | — | permission `licence` distincte |

## 6. Contrôles revendiqués (et où ils vivent)

| Contrôle | Emplacement |
| --- | --- |
| Sessions opaques hashées, TTL 24 h, révocation | `lib/auth.js` (`createSession`, `getSessionUser`, `revokeSession`), table `sessions` |
| Cookies HttpOnly / SameSite=Lax / Secure en production | `lib/auth.js cookieOptions()` |
| Lockout compte après 5 échecs (15 min) + limiteur fenêtre glissante | `lib/http.js` (`registerLoginFailure`, `rateLimit`) — durable côté DB |
| Mitigation CSRF (SameSite + contrôle d'origine sur toute mutation) | `lib/http.js assertSameOrigin` dans chaque route |
| RBAC serveur (matrice par rôle) | `lib/auth.js can()`, appliqué dans chaque page (`lib/pages.js pageContext`) et chaque route API |
| Requêtes paramétrées exclusivement | toutes les routes + pages (`pg` `$n`) |
| Append-only fiscal (défense en profondeur) | `db/migrations/0001_init.sql` règles `no_update` / `no_delete` sur `journal_replica`, `clotures`, `audit_log` |
| Vérification du chaînage SHA-256 à l'insert et en lecture | `lib/fiscal.js`, `/api/sync/push`, `/journal` |
| Idempotence de la réplication | unique `(restaurant_id, uuid_op)` + rejet seq non continue, `/api/sync/push` |
| Isolation tenant | `restaurant_id` de la session/jeton dans chaque requête ; jamais pris du corps |
| Hachage mots de passe / PIN bcrypt cost 10 | `app/api/users-mobile`, seed, login |
| Chemin de fichiers borné (exports) | `app/app/api/exports/[id]/route.js` (basename + préfixe de répertoire) |
| Dégradation de licence sans blocage fiscal | `lib/device.js syncAllowed()`, `/api/licence/status` |

## 7. Limites de couverture déclarées

- Faits dépendant du **déploiement** (TLS réel, unique instance vs multi-instance
  pour le limiteur mémoire, politique de sauvegarde PostgreSQL) → `needs_validation`.
- Les apps React Native (tablette, terminaux, KDS) sont des livrables documentés
  du PRD, non exécutables dans cet environnement : le stockage local du PIN
  (Keychain/Keystore) et la rétention 6 ans côté tablette sont couverts par le
  PRD mais pas testés ici.
