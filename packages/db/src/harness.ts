/**
 * Veritabanı testleri için ortam: bellekte çalışan gerçek bir PostgreSQL (PGlite) açar, Supabase'in sağladığı
 * rolleri ve `auth` şemasını taklit eder, sonra `supabase/migrations` içindeki dosyaları sırayla çalıştırır.
 * Böylece erişim kuralları ve fonksiyonlar canlı projeye dokunmadan denenir.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

/**
 * Supabase'in hazır getirdiği kadarı. İki ayar bilerek "en katı" hâliyle taklit edilir:
 * - Tablolar API rollerine kendiliğinden açılmaz (canlı projedeki ayar). Unutulan bir `grant` testte ortaya çıkar.
 * - Fonksiyonlar API rollerine kendiliğinden açılır (Supabase'in eski varsayılanı). Unutulan bir `revoke` testte ortaya çıkar.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;

  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

export type Actor = "anon" | { id: string };

export type TestDb = {
  pg: PGlite;
  /** Üye oluşturur (kayıt tetikleyicisi profilini de açar) ve kimliğini döner. */
  createUser(options?: { admin?: boolean; fullName?: string }): Promise<{ id: string }>;
  /**
   * Bir API isteğini taklit eder: tek bir işlem içinde, verilen kişinin rolü ve kimliğiyle çalışır.
   * Hata olursa işlem geri alınır (PostgREST'in davranışı).
   */
  as<T>(actor: Actor, run: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Kısıtsız (veritabanı sahibi olarak) sorgu; test verisi hazırlamak ve sonucu doğrulamak için. */
  rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
};

export async function createTestDb(options: { upTo?: string } = {}): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    try {
      await pg.exec(readFileSync(MIGRATIONS_DIR + file, "utf8"));
    } catch (error) {
      throw new Error(`${file} çalıştırılamadı: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (options.upTo && file.startsWith(options.upTo)) break;
  }

  let counter = 0;
  return {
    pg,
    async createUser({ admin = false, fullName }: { admin?: boolean; fullName?: string } = {}) {
      counter += 1;
      const meta = fullName ? { full_name: fullName } : {};
      const result = await pg.query<{ id: string }>(
        "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
        [`uye${counter}@example.com`, JSON.stringify(meta)],
      );
      const id = result.rows[0].id;
      if (admin) await pg.query("update public.profiles set role = 'admin' where id = $1", [id]);
      return { id };
    },
    as(actor, run) {
      const role = actor === "anon" ? "anon" : "authenticated";
      const claims = actor === "anon" ? { role } : { role, sub: actor.id };
      return pg.transaction(async (tx) => {
        await tx.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [role, JSON.stringify(claims)]);
        return run(tx);
      }) as Promise<Awaited<ReturnType<typeof run>>>;
    },
    async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params)).rows;
    },
    close: () => pg.close(),
  };
}
