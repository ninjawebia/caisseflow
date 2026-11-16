# Leads `needs_validation` — faits de déploiement à vérifier

Aucune sévérité (règle du workflow) : ce sont des traces réelles dont la décision
appartient à un fait qui n'existe que dans le déploiement.

## NV-1 — Seed de démonstration en production (SEC-001)

- **Blocage exact** : la source ne prouve pas que `db/seed.js` est absent de la
  procédure de déploiement. Le seed crée un jeton d'appareil issu d'un littéral
  public (`device-token-demo-POSTE-01`) et des mots de passe de démonstration.
- **Vérification non destructive pour le propriétaire** :
  1. relire la procédure de déploiement (Dokploy) : elle ne doit exécuter que
     `db/migrate.js` (ledger `schema_migrations`), jamais `db/seed.js` ;
  2. `SELECT left(token_hash, 8), poste FROM device_tokens;` — si un hash
     correspond au littéral de démonstration, révoquer (`actif=false`) et
     enrôler un jeton `crypto.randomBytes(32).toString('hex')` ;
  3. désactiver les comptes `*@local.test` dès l'enrôlement des vrais comptes.

## NV-2 — TLS, HSTS et en-têtes (SEC-002)

- **Blocage exact** : aucun point de terminaison TLS dans la source ; le flag
  `Secure` du cookie dépend de `NODE_ENV=production` côté processus.
- **Vérification non destructive pour le propriétaire** :
  1. `curl -sI https://<hôte>/` → attendre `HTTP/2 200` et
     `Strict-Transport-Security` ;
  2. `curl -sI -X POST https://<hôte>/api/auth/login` → le `Set-Cookie` doit
     contenir `Secure` et `HttpOnly` ;
  3. `curl -sI http://<hôte>/` → attendre une redirection 301 vers HTTPS.
