-- Bootstraps the two application-level roles used by the RLS spike.
--
-- otolaryn_owner: owns the database/schema, runs migrations. Table owner
--   privileges normally bypass RLS, but every business table is created with
--   FORCE ROW LEVEL SECURITY, so this role is subject to the policies too.
-- otolaryn_app:   the only role the running NestJS process authenticates as.
--   No BYPASSRLS, no ownership, no DDL rights — only DML on the tables it
--   needs. This is the role tests must prove can never see cross-tenant rows.
--
-- Runs once, as the POSTGRES_USER superuser, via docker-entrypoint-initdb.d.
-- CI reuses this same file against the postgres service container.

CREATE ROLE otolaryn_owner WITH LOGIN PASSWORD 'owner_change_me' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE otolaryn_app   WITH LOGIN PASSWORD 'app_change_me'   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE otolaryn OWNER otolaryn_owner;

\c otolaryn

GRANT CONNECT ON DATABASE otolaryn TO otolaryn_app;
GRANT USAGE ON SCHEMA public TO otolaryn_app;

-- Tables/sequences created later by otolaryn_owner (migrations) automatically
-- grant DML/usage to otolaryn_app, so nobody has to remember a manual GRANT
-- per migration.
ALTER DEFAULT PRIVILEGES FOR ROLE otolaryn_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO otolaryn_app;
ALTER DEFAULT PRIVILEGES FOR ROLE otolaryn_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO otolaryn_app;
