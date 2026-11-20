-- SafePath schema, v1.
-- Applied by `node tools/migrate.mjs`. Idempotent.
--
-- Design notes:
--  * There is deliberately NO location history table. `locations` holds one row
--    per member, overwritten in place. Adding history is a privacy decision, not
--    a schema convenience — see docs/PRIVACY-RISK-ASSESSMENT.md.
--  * `consent` is jsonb because it is read as a whole record and never queried
--    field-wise; keeping it as one object makes "what did they agree to, when"
--    a single atomic value that cannot be partially updated.
--  * Tokens are stored only as keyed HMACs (col: token_hash / hash). A database
--    dump cannot be replayed.
--  * Timestamps are bigint epoch milliseconds, matching the application's clock
--    source so that freshness comparisons never depend on database timezone.

create table if not exists users (
  id            uuid primary key,
  email         text not null unique,
  display_name  text not null,
  created_at    bigint not null,
  last_seen_at  bigint not null
);

create table if not exists sessions (
  id            text primary key,          -- HMAC(session token)
  user_id       uuid not null references users(id) on delete cascade,
  created_at    bigint not null,
  last_seen_at  bigint not null,
  expires_at    bigint not null,
  ip            text,
  user_agent    text
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

create table if not exists families (
  id            uuid primary key,
  name          text not null,
  owner_id      uuid,
  created_at    bigint not null
);

create table if not exists members (
  id                 uuid primary key,
  family_id          uuid not null references families(id) on delete cascade,
  user_id            uuid not null,
  role               text not null check (role in ('owner','adult')),
  state              text not null check (state in ('active','left','removed')),
  joined_at          bigint not null,
  left_at            bigint,
  removed_at         bigint,
  sharing_state      text not null check (sharing_state in ('on','off','paused')),
  sharing_updated_at bigint not null,
  consent            jsonb not null default '{}'::jsonb,
  extra              jsonb not null default '{}'::jsonb
);
-- One active membership per person per family. This is the constraint that makes
-- "accepting an invitation twice" impossible at the database level, not just in
-- application code.
create unique index if not exists members_one_active_per_user
  on members (family_id, user_id) where state = 'active';
create index if not exists members_user_idx on members (user_id) where state = 'active';
create index if not exists members_family_idx on members (family_id) where state = 'active';

create table if not exists invites (
  id           uuid primary key,
  family_id    uuid not null references families(id) on delete cascade,
  created_by   uuid not null,
  token_hash   text not null unique,
  created_at   bigint not null,
  expires_at   bigint not null,
  used_at      bigint,
  used_by      uuid,
  revoked_at   bigint
);
create index if not exists invites_family_idx on invites (family_id);

-- One row per member. No history. Deleted (not flagged) when a member stops
-- sharing, leaves, is removed, or when retention expires.
create table if not exists locations (
  member_id    uuid primary key,
  family_id    uuid not null,
  user_id      uuid not null,
  lat          double precision not null,
  lng          double precision not null,
  accuracy_m   integer not null,
  captured_at  bigint not null,
  received_at  bigint not null,
  source       text not null check (source in ('foreground','background','checkin'))
);
create index if not exists locations_received_idx on locations (received_at);

create table if not exists signin_codes (
  email       text primary key,
  hash        text not null,
  created_at  bigint not null,
  expires_at  bigint not null,
  attempts    integer not null default 0
);
create index if not exists signin_codes_expiry_idx on signin_codes (expires_at);

-- Append-only. Contains opaque ids and event names only: no coordinates, no
-- tokens, no codes. Verified by a test that greps this table's output.
create table if not exists audit (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  event      text not null,
  user_id    uuid,
  family_id  uuid,
  fields     jsonb not null default '{}'::jsonb
);
create index if not exists audit_user_idx on audit (user_id);
create index if not exists audit_ts_idx on audit (ts desc);

-- Housekeeping: delete expired positions even if the app never runs a sweep.
-- Enabled by the migrator; the application sweep is a second line of defence.
-- (Commented out by default: a cron/scheduler is the production answer.)
-- create extension if not exists pg_cron;
