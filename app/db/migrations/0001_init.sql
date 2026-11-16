-- Migration 0001 — CaisseFlow (PRD chapter 9.3)
-- Cloud PostgreSQL schema. Journal and audit are append-only by design:
-- UPDATE/DELETE are blocked by database rules (defense in depth).

CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    siret TEXT NOT NULL UNIQUE,
    adresse TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE licences (
    restaurant_id UUID PRIMARY KEY REFERENCES restaurants(id) ON DELETE RESTRICT,
    etat TEXT NOT NULL DEFAULT 'active'
        CHECK (etat IN ('active', 'grace1', 'grace2', 'bloquee')),
    impayee_depuis DATE,
    grace1_at TIMESTAMPTZ,
    grace2_at TIMESTAMPTZ,
    bloque_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users_web (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE RESTRICT,
    email TEXT NOT NULL UNIQUE,
    hashedPassword TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('gerant', 'expert_comptable', 'auditeur', 'admin_plateforme')),
    nom TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled BOOLEAN NOT NULL DEFAULT false,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    actif BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users_mobile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    matricule TEXT NOT NULL,
    nom TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('gerant', 'second', 'serveur', 'cuisine')),
    pin_hash TEXT NOT NULL,
    actif BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, matricule)
);

CREATE TABLE device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    poste TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    actif BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    nom TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (restaurant_id, nom)
);

CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    categorie_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    nom TEXT NOT NULL,
    prix_ttc NUMERIC(10, 2) NOT NULL CHECK (prix_ttc >= 0 AND prix_ttc <= 10000),
    taux_tva NUMERIC(4, 1) NOT NULL CHECK (taux_tva IN (0, 5.5, 10, 20)),
    actif BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, nom)
);
CREATE INDEX idx_articles_resto ON articles (restaurant_id, actif);

CREATE TABLE tables_resto (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    nom TEXT NOT NULL,
    salle TEXT NOT NULL DEFAULT 'Salle 1',
    places INTEGER NOT NULL DEFAULT 2 CHECK (places BETWEEN 1 AND 20),
    UNIQUE (restaurant_id, nom)
);

CREATE TABLE journal_replica (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    poste TEXT NOT NULL,
    seq INTEGER NOT NULL,
    ref TEXT NOT NULL UNIQUE,
    uuid_op UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('VENTE', 'PAIEMENT', 'TICKET', 'ANNULATION', 'REMISE', 'CHANGEMENT_PRIX', 'SESSION', 'HORLOGE', 'CLOTURE_Z', 'IMPRESSION')),
    "timestamp" TIMESTAMPTZ NOT NULL,
    user_matricule TEXT NOT NULL,
    validator_matricule TEXT,
    motif TEXT,
    payload JSONB NOT NULL,
    hash_prev TEXT NOT NULL CHECK (hash_prev ~ '^[0-9a-f]{64}$'),
    hash_self TEXT NOT NULL CHECK (hash_self ~ '^[0-9a-f]{64}$'),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, poste, seq),
    UNIQUE (restaurant_id, uuid_op)
);
CREATE RULE journal_replica_no_update AS ON UPDATE TO journal_replica DO INSTEAD NOTHING;
CREATE RULE journal_replica_no_delete AS ON DELETE TO journal_replica DO INSTEAD NOTHING;
CREATE INDEX idx_journal_resto_ts ON journal_replica (restaurant_id, "timestamp");
CREATE INDEX idx_journal_type ON journal_replica (restaurant_id, type);

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
CREATE RULE clotures_no_update AS ON UPDATE TO clotures DO INSTEAD NOTHING;
CREATE RULE clotures_no_delete AS ON DELETE TO clotures DO INSTEAD NOTHING;

CREATE TABLE exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
    demandeur_id UUID NOT NULL REFERENCES users_web(id),
    type TEXT NOT NULL CHECK (type IN ('journal', 'clotures', 'ventes', 'complet')),
    format TEXT NOT NULL CHECK (format IN ('csv', 'json', 'pdf')),
    from_period DATE,
    to_period DATE,
    fichier TEXT NOT NULL,
    empreinte TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    diff_summary JSONB,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users_web(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE ticket_template (
    restaurant_id UUID PRIMARY KEY REFERENCES restaurants(id) ON DELETE RESTRICT,
    logo_text TEXT NOT NULL DEFAULT '',
    mentions TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sync_logs (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id UUID NOT NULL,
    poste TEXT NOT NULL,
    accepted INTEGER NOT NULL,
    duplicates INTEGER NOT NULL,
    rejected INTEGER NOT NULL,
    chain_verified BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
