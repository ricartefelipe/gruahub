-- Schema dedicado ao Keycloak (KC_DB_SCHEMA=keycloak).
-- Executado pelo entrypoint do Postgres em volumes novos.
CREATE SCHEMA IF NOT EXISTS keycloak AUTHORIZATION gruahub;
GRANT ALL ON SCHEMA keycloak TO gruahub;
