// Uçtan uca denemelerin ortak düzeni. Siteyi sahte bir Supabase'e bağlı olarak derleyip yerelde çalıştırır;
// gerçek projeye istek gitmez, e-posta gönderilmez. Sahte sunucu gerçek tabloları kullanır: supabase/migrations
// içindeki dosyalar bellekteki bir PostgreSQL'e (PGlite) kurulur, erişim kuralları gerçekten uygulanır.
//
// Çalıştırma (apps/web içinde): pnpm e2e
// Gerekenler: Node 22.18 ya da üstü (TypeScript dosyasını doğrudan yükler), Playwright ve Chromium.
// `.next` klasörünün üzerine yazar; 3123 ve 54321 numaralı kapılar boş olmalıdır.
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const { startMock, settings } = require('./mock-supabase.cjs');

const SITE_PORT = 3123;
const MOCK_PORT = 54321;
const BASE = `http://localhost:${SITE_PORT}`;
const MOCK = `http://localhost:${MOCK_PORT}`;
const WEB_DIR = path.join(__dirname, '..');
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: MOCK,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_yerel_deneme',
};
const WAIT = { timeout: 8000 };

const out = [];
let failed = 0;
function check(name, cond, extra = '') {
  if (!cond) failed++;
  out.push(`${cond ? 'OK  ' : 'HATA'} ${name}${!cond && extra ? ' → ' + extra : ''}`);
}

async function waitForSite() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Site açılmadı: ' + BASE);
}

/** Bir bölüm yarıda kesilirse hata olarak yazılır ve sonraki bölümle devam edilir. */
async function section(name, run) {
  try {
    await run();
  } catch (e) {
    check(`${name}: bölüm yarıda kesildi`, false, String(e.message).split('\n')[0]);
  }
}

/** Koşul sağlanana kadar kısa aralıklarla dener (sunucudaki bir değişikliği beklemek için). */
async function eventually(cond, ms = 4000) {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return Boolean(await cond());
}

/** Bir sayfa için kısa yardımcılar. Next.js önceki sayfaları gizli tuttuğundan yalnızca görünen öğelere bakılır. */
function kit(p) {
  const L = (label, opts) => p.getByLabel(label, opts).filter({ visible: true });
  const text = (selector) => p.locator(selector).filter({ visible: true }).first().textContent({ timeout: 4000 }).catch(() => '(yok)');
  const k = {
    L,
    alert: () => text('main [role=alert]'),
    status: () => text('main p[role=status]'),
    main: () => text('main'),
    heading: async (name) => {
      const h = p.getByRole('heading', { name, level: 1 });
      await h.waitFor(WAIT).catch(() => {});
      return h.isVisible();
    },
    arrives: async (pathname) => {
      await p.waitForURL(BASE + pathname, WAIT).catch(() => {});
      return p.url() === BASE + pathname;
    },
    headerBtns: async () => (await p.locator('header a.btn').allTextContents()).join(','),
    profile: async () => {
      await L('Ad Soyad').waitFor(WAIT).catch(() => {});
      return [await L('Ad Soyad').inputValue(), await L('Telefon').inputValue(), await L(/niversite/).inputValue()].join('|');
    },
    pwValues: () => p.evaluate(() => Array.from(document.querySelectorAll('input[type=password]')).map((i) => i.value).filter(Boolean).length),
    signup: async ({ name, email, password, phone = '05321112233', school = '' }) => {
      await p.goto(BASE + '/kayit');
      await L('Ad Soyad').fill(name);
      await L('E-posta').fill(email);
      await L('Şifre', { exact: true }).fill(password);
      await L('Telefon').fill(phone);
      await L('Okuduğun ya da mezun olduğun üniversite').fill(school);
      await p.getByRole('checkbox').check();
      await p.getByRole('button', { name: 'Hesap oluştur' }).click();
      return k.heading('E-postanı kontrol et');
    },
    login: async (email, password) => {
      await p.goto(BASE + '/giris');
      await L('E-posta').fill(email);
      await L('Şifre', { exact: true }).fill(password);
      await p.locator('form button[type=submit]').filter({ visible: true }).click();
    },
    signOut: async () => {
      await p.goto(BASE + '/hesabim');
      const button = p.getByRole('button', { name: 'Çıkış yap' });
      // Oturum yoksa sayfa girişe yönlenir: önceki bir kontrol başarısız olsa da kalan denemeler sürsün.
      await Promise.race([button.waitFor(WAIT), p.waitForURL(BASE + '/giris', WAIT)]).catch(() => {});
      if (!(await button.isVisible())) return;
      await button.click();
      await p.waitForURL(BASE + '/', WAIT).catch(() => {});
    },
    google: async (choice) => {
      await p.getByRole('button', { name: 'Google ile devam et' }).click();
      await p.locator(choice).click();
    },
  };
  return k;
}

/** Tarayıcıyı açar. `device()` ayrı bir oturum verir: başka bir cihaz ya da e-posta uygulamasının kendi tarayıcısı gibi davranır. */
async function openBrowser() {
  const browser = await chromium.launch();
  const errors = [];
  async function device(viewport = { width: 1280, height: 900 }) {
    const ctx = await browser.newContext({ viewport });
    ctx.setDefaultTimeout(WAIT.timeout);
    ctx.on('page', (page) => {
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
      });
    });
    return ctx;
  }
  return { browser, device, errors };
}

/** Siteyi derler, sahte sunucuyla birlikte başlatır, deneme takımlarını sırayla koşar ve sonucu yazar. */
async function main(suites) {
  const build = spawnSync('pnpm', ['exec', 'next', 'build'], { cwd: WEB_DIR, env, stdio: ['ignore', 'ignore', 'inherit'] });
  if (build.status !== 0) throw new Error('Derleme başarısız.');
  settings.siteUrl = BASE;
  const mock = await startMock(MOCK_PORT);
  const site = spawn('pnpm', ['exec', 'next', 'start', '-p', String(SITE_PORT)], { cwd: WEB_DIR, env, stdio: 'ignore', detached: true });
  let crashed = null;
  try {
    await waitForSite();
    for (const suite of suites) await suite();
  } catch (e) {
    crashed = e;
  } finally {
    try {
      process.kill(-site.pid);
    } catch {}
    mock.close();
  }
  console.log(out.join('\n'));
  if (crashed) {
    console.error('\nBETİK HATASI:', crashed);
    process.exit(2);
  }
  console.log(failed ? `\n${failed} KONTROL BAŞARISIZ` : `\nTÜM KONTROLLER GEÇTİ (${out.length})`);
  process.exit(failed ? 1 : 0);
}

module.exports = { BASE, MOCK, WAIT, check, section, eventually, kit, openBrowser, main };
