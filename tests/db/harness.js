/* A local Postgres (PGlite) with the bits of Supabase the schema relies on, so migrations,
   access rules and database functions can be tested without touching the live project. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

/** Migration files in order (001, 002, …), optionally only up to a number. */
export function migrationFiles(upTo = Infinity) {
  return readdirSync(join(ROOT, 'migrations')).filter(f => /^\d{3}-.*\.sql$/.test(f)).sort().filter(f => +f.slice(0, 3) <= upTo);
}

/** A fresh database with schema.sql and the migrations applied. */
export async function freshDb({ upTo = Infinity } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));
  for (const f of migrationFiles(upTo)) {
    try { await db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
  }
  return db;
}

/**
 * Run statements as a signed-in user (or anonymous with email null), inside a transaction
 * that is rolled back unless keep is true. Returns the rows of the last statement.
 */
export async function as(db, email, sql, params = [], { keep = false } = {}) {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(email ? { email, role: 'authenticated' } : { role: 'anon' })]);
    await db.exec(`set local role ${email ? 'authenticated' : 'anon'}`);
    const r = await db.query(sql, params);
    await db.exec(keep ? 'commit' : 'rollback');
    return r.rows;
  } catch (e) { await db.exec('rollback'); throw e; }
}

/** Run as the database owner (like the Supabase SQL editor). */
export const admin = async (db, sql, params = []) => (await db.query(sql, params)).rows;

/** A tiny church: Jerry (admin, on the roster), Anna (coordinator), one published and one draft Sunday. */
export async function seedChurch(db) {
  await db.exec(`
    insert into admins (email) values ('jerry@montcarmel.org') on conflict do nothing;
    insert into coordinators (id, name, email, lang_en, lang_fr, active, max_per_month) values
      ('jerry', 'Jerry Kibombo', 'jerry@montcarmel.org', true, true, true, 4),
      ('anna', 'Anna Mukendi', 'anna@montcarmel.org', true, true, true, 4);
    insert into sundays (id, date, published, special, services) values
      ('2026-11-01', '2026-11-01', true, false, '{"en":{},"fr":{}}'),
      ('2026-11-08', '2026-11-08', false, false, '{"en":{},"fr":{}}');
  `);
}
export const JERRY = 'jerry@montcarmel.org', ANNA = 'anna@montcarmel.org', STRANGER = 'someone@example.com';
