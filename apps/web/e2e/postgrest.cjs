// Sahte Supabase'in veri tarafı: sitenin kullandığı kadarıyla PostgREST (Supabase'in /rest/v1 arayüzü).
// İstekleri SQL'e çevirir ve bellekte çalışan gerçek bir PostgreSQL'de, isteği yapanın rolüyle çalıştırır.
// Veritabanı supabase/migrations içindeki dosyalarla kurulduğundan erişim kuralları, kısıtlar ve
// fonksiyonlar canlı projedekiyle aynıdır (bkz. packages/db/src/harness.ts).
//
// Desteklenenler: select (düz sütun listesi), eq/neq/gt/gte/lt/lte/like/ilike/is/in süzgeçleri (not. ile),
// order, limit, offset, POST (ekleme), PATCH, DELETE, rpc, Prefer: return=representation ve tek satır isteği.
// Desteklenmeyen bir özellik kullanılırsa sessizce geçmez, 400 döner.

const IDENT = /^[a-z_][a-z0-9_]*$/;
const OPERATORS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'columns']);

class RestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const unsupported = (what) => new RestError(400, 'PGRST100', `mock: desteklenmiyor: ${what}`);

function ident(name) {
  if (!IDENT.test(name)) throw unsupported(`ad "${name}"`);
  return `"${name}"`;
}
// PostgREST gibi: değerler türü belirsiz sabitler olarak yazılır, PostgreSQL sütunun türüne çevirir.
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;

function columnList(select) {
  if (!select || select === '*') return '*';
  return select
    .split(',')
    .map((c) => ident(c.trim()))
    .join(', ');
}

function listItems(text) {
  if (!text.startsWith('(') || !text.endsWith(')')) throw unsupported(`in listesi "${text}"`);
  const inner = text.slice(1, -1);
  const items = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quoted) {
      if (ch === '\\') current += inner[++i] ?? '';
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      items.push(current);
      current = '';
    } else current += ch;
  }
  if (inner.length) items.push(current);
  return items;
}

function condition(column, expression) {
  let negate = false;
  let rest = expression;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  const op = dot === -1 ? rest : rest.slice(0, dot);
  const value = dot === -1 ? '' : rest.slice(dot + 1);
  let sql;
  if (op === 'like' || op === 'ilike') sql = `${ident(column)} ${op} ${literal(value.replace(/\*/g, '%'))}`;
  else if (op in OPERATORS) sql = `${ident(column)} ${OPERATORS[op]} ${literal(value)}`;
  else if (op === 'is') {
    if (!['null', 'true', 'false', 'unknown'].includes(value)) throw unsupported(`is.${value}`);
    sql = `${ident(column)} is ${value}`;
  } else if (op === 'in') {
    const items = listItems(value);
    sql = items.length ? `${ident(column)} in (${items.map(literal).join(', ')})` : 'false';
  } else throw unsupported(`süzgeç "${column}=${expression}"`);
  return negate ? `not (${sql})` : sql;
}

function parseQuery(query) {
  const filters = [];
  for (const [key, value] of query) {
    if (RESERVED.has(key)) continue;
    if (key === 'and' || key === 'or' || key === 'on_conflict' || key.includes('.')) throw unsupported(`"${key}" parametresi`);
    filters.push(condition(key, value));
  }
  const order = (query.get('order') || '')
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [column, ...flags] = part.split('.');
      const unknown = flags.find((f) => !['asc', 'desc', 'nullsfirst', 'nullslast'].includes(f));
      if (unknown) throw unsupported(`sıralama "${part}"`);
      const direction = flags.includes('desc') ? 'desc' : 'asc';
      const nulls = flags.includes('nullsfirst') ? ' nulls first' : flags.includes('nullslast') ? ' nulls last' : '';
      return `${ident(column)} ${direction}${nulls}`;
    });
  const number = (name) => {
    const raw = query.get(name);
    if (raw === null) return null;
    if (!/^\d+$/.test(raw)) throw unsupported(`${name}=${raw}`);
    return Number(raw);
  };
  return {
    where: filters.length ? ` where ${filters.join(' and ')}` : '',
    hasFilters: filters.length > 0,
    tail: `${order.length ? ` order by ${order.join(', ')}` : ''}${number('limit') !== null ? ` limit ${number('limit')}` : ''}${number('offset') !== null ? ` offset ${number('offset')}` : ''}`,
    columns: columnList(query.get('select')),
  };
}

/** PostgreSQL hata kodunu PostgREST'in döndürdüğü HTTP durumuna çevirir. */
function statusFor(code, authenticated) {
  if (code === '42501') return authenticated ? 403 : 401;
  if (code === '23503' || code === '23505') return 409;
  if (code === '42883' || code === '42P01') return 404;
  if (code === '21000') return 400;
  if (/^(22|23|P0)/.test(code || '')) return 400;
  return 500;
}

/**
 * @param pg PGlite veritabanı
 * @param request { method, resource, query: URLSearchParams, body, prefer, accept, user: { id, email } | null }
 * @returns { status, body } (body: gönderilecek JSON metni ya da undefined)
 */
async function handleRest(pg, { method, resource, query, body, prefer = '', accept = '', user }) {
  const role = user ? 'authenticated' : 'anon';
  const claims = user ? { role, sub: user.id, email: user.email } : { role };
  const representation = /return=representation/.test(prefer);
  const single = accept.includes('application/vnd.pgrst.object+json');

  try {
    return await pg.transaction(async (tx) => {
      await tx.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [role, JSON.stringify(claims)]);

      const finish = (status, json) => {
        if (!single) return { status, body: json };
        const rows = JSON.parse(json);
        if (rows.length !== 1) {
          throw new RestError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
        }
        return { status, body: JSON.stringify(rows[0]) };
      };
      const aggregate = async (cte, columns, params) => {
        const sql = `${cte} select coalesce(json_agg(r), '[]'::json)::text as body from (select ${columns} from result) r`;
        return (await tx.query(sql, params)).rows[0].body;
      };

      if (resource.startsWith('rpc/')) {
        if (method !== 'POST') throw unsupported(`${method} rpc`);
        const name = resource.slice(4);
        ident(name);
        const found = await tx.query(
          `select p.proargnames as names,
                  (select array_agg(format_type(a.t, null) order by a.ord) from unnest(p.proargtypes) with ordinality as a(t, ord)) as types
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
          [name],
        );
        if (found.rows.length !== 1) throw new RestError(404, 'PGRST202', `Could not find the function public.${name} in the schema cache`);
        const names = found.rows[0].names || [];
        const types = found.rows[0].types || [];
        const args = Object.keys(body || {}).map((key) => {
          const index = names.indexOf(key);
          if (index === -1) throw new RestError(404, 'PGRST202', `Could not find the function public.${name}(${key}) in the schema cache`);
          const type = types[index];
          const value = type === 'json' || type === 'jsonb' ? `($1::json -> ${literal(key)})::${type}` : `($1::json ->> ${literal(key)})::${type}`;
          return `${ident(key)} => ${value}`;
        });
        const result = await tx.query(`select to_json(public.${ident(name)}(${args.join(', ')}))::text as body`, args.length ? [JSON.stringify(body)] : []);
        return { status: 200, body: result.rows[0].body ?? 'null' };
      }

      const table = `public.${ident(resource)}`;
      const q = parseQuery(query);

      if (method === 'GET' || method === 'HEAD') {
        const json = await aggregate(`with result as (select * from ${table}${q.where}${q.tail})`, q.columns, []);
        return finish(200, json);
      }

      if (method === 'POST') {
        if (/resolution=/.test(prefer)) throw unsupported('upsert');
        const rows = Array.isArray(body) ? body : [body];
        if (!rows.length || !rows[0] || typeof rows[0] !== 'object') throw new RestError(400, 'PGRST102', 'Empty or invalid json');
        const columns = Object.keys(rows[0]).map(ident).join(', ');
        const insert = `insert into ${table} (${columns}) select ${columns} from json_populate_recordset(null::${table}, $1::json)`;
        if (!representation) {
          await tx.query(insert, [JSON.stringify(rows)]);
          return { status: 201 };
        }
        return finish(201, await aggregate(`with result as (${insert} returning *)`, q.columns, [JSON.stringify(rows)]));
      }

      if (method === 'PATCH') {
        // Supabase'de süzgeçsiz güncelleme ve silme kapalıdır (pg-safeupdate).
        if (!q.hasFilters) throw new RestError(400, '21000', 'UPDATE requires a WHERE clause');
        const keys = Object.keys(body || {});
        if (!keys.length) return representation ? finish(200, '[]') : { status: 204 };
        const columns = keys.map(ident).join(', ');
        const update = `update ${table} set (${columns}) = (select ${columns} from json_populate_record(null::${table}, $1::json))${q.where}`;
        if (!representation) {
          await tx.query(update, [JSON.stringify(body)]);
          return { status: 204 };
        }
        return finish(200, await aggregate(`with result as (${update} returning *)`, q.columns, [JSON.stringify(body)]));
      }

      if (method === 'DELETE') {
        if (!q.hasFilters) throw new RestError(400, '21000', 'DELETE requires a WHERE clause');
        const remove = `delete from ${table}${q.where}`;
        if (!representation) {
          await tx.query(remove);
          return { status: 204 };
        }
        return finish(200, await aggregate(`with result as (${remove} returning *)`, q.columns, []));
      }

      throw unsupported(method);
    });
  } catch (e) {
    if (e instanceof RestError) return { status: e.status, body: JSON.stringify({ code: e.code, message: e.message, details: null, hint: null }) };
    const code = typeof e.code === 'string' ? e.code : 'XX000';
    return {
      status: statusFor(code, !!user),
      body: JSON.stringify({ code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null }),
    };
  }
}

module.exports = { handleRest };
