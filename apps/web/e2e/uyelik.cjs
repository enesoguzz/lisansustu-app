// Üyelik akışlarını (kayıt, kodla doğrulama, giriş, şifre sıfırlama, hesabım) uçtan uca dener.
// Siteyi sahte bir Supabase'e bağlı olarak derleyip yerelde çalıştırır; gerçek projeye istek gitmez.
//
// Çalıştırma (apps/web içinde): pnpm e2e
// Gerekenler: Playwright ve Chromium kurulu olmalı. `.next` klasörünün üzerine yazar.
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const { startMock, GOOD_CODE, requestLog } = require('./mock-supabase.cjs');

const SITE_PORT = 3123;
const MOCK_PORT = 54321;
const BASE = `http://localhost:${SITE_PORT}`;
const WEB_DIR = path.join(__dirname, '..');
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_yerel_deneme',
};

const out = [];
let failed = 0;
function check(name, cond, extra = '') {
  if (!cond) failed++;
  out.push(`${cond ? 'OK  ' : 'HATA'} ${name}${extra ? ' → ' + extra : ''}`);
}
const stamp = Date.now();
const MAIL_A = `deneme-a-${stamp}@example.com`;
const MAIL_B = `deneme-b-${stamp}@example.com`;
const PW1 = 'yerel-deneme-1';
const PW2 = 'yerel-deneme-2';

async function waitForSite() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Site açılmadı: ' + BASE);
}

async function checks() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
  });
  const L = (label, opts) => p.getByLabel(label, opts).filter({ visible: true });
  const pwValues = () => p.evaluate(() => Array.from(document.querySelectorAll('input[type=password]')).map((i) => i.value).filter(Boolean).length);
  const alertText = async () => (await p.locator('form [role=alert]').filter({ visible: true }).first().textContent({ timeout: 4000 }).catch(() => '(yok)'));
  const statusText = async () => (await p.locator('form [role=status]').filter({ visible: true }).first().textContent({ timeout: 4000 }).catch(() => '(yok)'));
  const headerBtns = async () => (await p.locator('header a.btn').allTextContents()).join(',');
  const signOut = async () => {
    await p.goto(BASE + '/hesabim');
    await p.getByRole('button', { name: 'Çıkış yap' }).click();
    await p.waitForURL(BASE + '/', { timeout: 8000 });
  };

  // 1. Oturum yokken
  await p.goto(BASE + '/hesabim');
  await p.waitForURL(BASE + '/giris', { timeout: 8000 }).catch(() => {});
  check('oturumsuz /hesabim girişe yönlenir', p.url() === BASE + '/giris', p.url());
  check('üst menüde giriş düğmeleri', (await headerBtns()) === 'Giriş yap,Ücretsiz başla', await headerBtns());

  // 2. Kayıt formu doğrulamaları (sunucuya istek gitmemeli)
  await p.goto(BASE + '/kayit');
  const submit = () => p.getByRole('button', { name: 'Hesap oluştur' }).click();
  await submit();
  check('boş ad', (await alertText()) === 'Adını ve soyadını yaz.', await alertText());
  await L('Ad Soyad').fill('  Deneme Kullanıcı ');
  await L('E-posta').fill('abc');
  await submit();
  check('bozuk e-posta', (await alertText()) === 'Geçerli bir e-posta adresi gir.', await alertText());
  await L('E-posta').fill('  ' + MAIL_A.toUpperCase() + ' ');
  await L('Şifre', { exact: true }).fill('1234567');
  await submit();
  check('kısa şifre', (await alertText()) === 'Şifre en az 8 karakter olmalı.', await alertText());
  await L('Şifre', { exact: true }).fill(PW1);
  await L('Telefon').fill('123');
  await submit();
  check('bozuk telefon', /05xx xxx xx xx/.test(await alertText()), await alertText());
  await L('Telefon').fill('+90 532 111 22 33');
  await submit();
  check('onay kutusu işaretsiz', /aydınlatma metnini/.test(await alertText()), await alertText());
  check('doğrulama aşamasında sunucuya istek yok', !requestLog.some((l) => l.includes('/signup')));

  // 3. Kayıt ve kod adımı
  await L('Okuduğun ya da mezun olduğun üniversite').fill('Deneme Üniversitesi');
  await p.getByRole('checkbox').check();
  await submit();
  await p.getByRole('heading', { name: 'E-postanı doğrula' }).waitFor({ timeout: 8000 }).catch(() => {});
  const st = await statusText();
  check('kod adımı açılır, e-posta küçük harfle ve kırpılmış', st.includes(MAIL_A) && st.includes('6 haneli'), st);
  const verifyBtn = p.getByRole('button', { name: 'Doğrula' });
  await L('Doğrulama kodu').fill('12ab3');
  check('harfler silinir, eksik kodda düğme kapalı', (await L('Doğrulama kodu').inputValue()) === '123' && (await verifyBtn.isDisabled()));
  check('tekrar gönder 60 sn kilitli', /Yeni kod için \d+ sn bekle/.test(await p.locator('form button[type=button]').filter({ visible: true }).textContent()));
  await L('Doğrulama kodu').fill('000000');
  await verifyBtn.click();
  check('yanlış kod mesajı', /Kod hatalı ya da süresi dolmuş/.test(await alertText()), await alertText());
  check('yanlış koddan sonra düğme yeniden açık', await verifyBtn.isEnabled());
  await L('Doğrulama kodu').fill(GOOD_CODE);
  await verifyBtn.click();
  await p.waitForURL(BASE + '/hesabim', { timeout: 8000 }).catch(() => {});
  check('doğru kod hesabıma götürür', p.url() === BASE + '/hesabim', p.url());
  await L('Ad Soyad').waitFor({ timeout: 8000 }).catch(() => {});
  const vals = async () => [await L('Ad Soyad').inputValue(), await L('Telefon').inputValue(), await L('Üniversite').inputValue()].join('|');
  check('profil kayıttaki bilgilerle dolu', (await vals()) === 'Deneme Kullanıcı|05321112233|Deneme Üniversitesi', await vals());
  check('hesap sayfasında e-posta görünür', (await p.locator('section p').filter({ visible: true }).first().textContent()) === MAIL_A);
  check('üst menü Hesabım gösterir', (await headerBtns()) === 'Hesabım', await headerBtns());

  // 4. Profil güncelleme
  await L('Üniversite').fill('Yeni Üniversite');
  await p.getByRole('button', { name: 'Kaydet' }).click();
  check('kaydedildi mesajı', (await statusText()) === 'Bilgilerin kaydedildi.', await statusText());
  await L('Telefon').fill('12');
  await p.getByRole('button', { name: 'Kaydet' }).click();
  check('hesabımda bozuk telefon', /05xx xxx xx xx/.test(await alertText()), await alertText());
  await p.reload();
  await L('Ad Soyad').waitFor({ timeout: 8000 }).catch(() => {});
  check('yenilemede oturum ve bilgiler korunur', (await vals()) === 'Deneme Kullanıcı|05321112233|Yeni Üniversite', await vals());

  // 5. Çıkış ve giriş
  await p.getByRole('button', { name: 'Çıkış yap' }).click();
  await p.waitForURL(BASE + '/', { timeout: 8000 }).catch(() => {});
  check('çıkış ana sayfaya götürür', p.url() === BASE + '/', p.url());
  check('çıkıştan sonra giriş düğmeleri', (await headerBtns()) === 'Giriş yap,Ücretsiz başla', await headerBtns());
  await p.goto(BASE + '/hesabim');
  await p.waitForURL(BASE + '/giris', { timeout: 8000 }).catch(() => {});
  check('çıkıştan sonra /hesabim kapalı', p.url() === BASE + '/giris', p.url());

  const login = async (mail, pw) => {
    await p.goto(BASE + '/giris');
    await L('E-posta').fill(mail);
    await L('Şifre', { exact: true }).fill(pw);
    await p.locator('form button[type=submit]').filter({ visible: true }).click();
  };
  await p.goto(BASE + '/giris');
  await p.locator('form button[type=submit]').filter({ visible: true }).click();
  check('boş giriş', (await alertText()) === 'E-posta ve şifreni yaz.', await alertText());
  await login(MAIL_A, 'yanlis-sifre-9');
  check('yanlış şifre mesajı', (await alertText()) === 'E-posta ya da şifre hatalı.', await alertText());
  await login(MAIL_A, PW1);
  await p.waitForURL(BASE + '/hesabim', { timeout: 8000 }).catch(() => {});
  check('doğru şifre hesabıma götürür', p.url() === BASE + '/hesabim', p.url());
  await p.waitForTimeout(700);
  check('girişten sonra şifre sayfada kalmaz', (await pwValues()) === 0, 'dolu şifre alanı: ' + (await pwValues()));
  await signOut();
  // Çıkıştan sonra menüden girişe dönülünce form temiz ve kullanılabilir olmalı
  await p.locator('header').getByRole('link', { name: 'Giriş yap' }).click();
  await p.getByRole('heading', { name: 'Tekrar hoş geldin' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('çıkış sonrası giriş formu temiz', (await L('E-posta').inputValue()) === '' && (await L('Şifre', { exact: true }).inputValue()) === '' && (await p.locator('form button[type=submit]').filter({ visible: true }).textContent()) === 'Giriş yap');

  // Sayfalar arası geçişte yazılan şifre saklanmamalı
  await L('E-posta').fill('gecici@example.com');
  await L('Şifre', { exact: true }).fill('yerel-deneme-9');
  await p.locator('main').getByRole('link', { name: 'Ücretsiz başla' }).click();
  await p.getByRole('heading', { name: 'Ücretsiz hesap oluştur' }).waitFor({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(700);
  check('sayfadan çıkınca şifre arka planda kalmaz', (await pwValues()) === 0, 'dolu şifre alanı: ' + (await pwValues()));
  await p.locator('main').getByRole('link', { name: 'Giriş yap' }).click();
  await p.getByRole('heading', { name: 'Tekrar hoş geldin' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('geri dönünce giriş formu boş', (await L('E-posta').inputValue()) === '' && (await L('Şifre', { exact: true }).inputValue()) === '');

  // 6. Aynı e-postayla ikinci kayıt
  await p.goto(BASE + '/kayit');
  await L('Ad Soyad').fill('Başka Biri');
  await L('E-posta').fill(MAIL_A);
  await L('Şifre', { exact: true }).fill(PW1);
  await L('Telefon').fill('05321112233');
  await p.getByRole('checkbox').check();
  await submit();
  check('kayıtlı e-posta mesajı', /zaten bir hesap var/.test(await alertText()), await alertText());

  // 7. Kaydı yarım kalmış üye giriş yapınca kod adımına geçer
  await L('E-posta').fill(MAIL_B);
  await submit();
  await p.getByRole('heading', { name: 'E-postanı doğrula' }).waitFor({ timeout: 8000 }).catch(() => {});
  await p.locator('header').getByRole('link', { name: 'Giriş yap' }).click();
  await p.getByRole('heading', { name: 'Tekrar hoş geldin' }).waitFor({ timeout: 8000 }).catch(() => {});
  await p.locator('header').getByRole('link', { name: 'Ücretsiz başla' }).click();
  await p.getByRole('heading', { name: 'Ücretsiz hesap oluştur' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('kod adımından çıkıp dönünce kayıt formu baştan başlar', (await p.getByRole('button', { name: 'Hesap oluştur' }).isVisible()) && (await L('Ad Soyad').inputValue()) === '');
  await login(MAIL_B, PW1);
  await p.getByText('Giriş yapmadan önce e-postanı doğrulaman gerekiyor.').waitFor({ timeout: 8000 }).catch(() => {});
  check('doğrulanmamış üye kod adımına alınır', await L('Doğrulama kodu').isVisible().catch(() => false));
  check('yarım kayıtta yeni kod istenir', requestLog.filter((l) => l.includes('/resend')).length === 1);
  await L('Doğrulama kodu').fill(GOOD_CODE);
  await p.getByRole('button', { name: 'Doğrula' }).click();
  await p.waitForURL(BASE + '/hesabim', { timeout: 8000 }).catch(() => {});
  check('kod sonrası hesabım (okul boş bırakılmış)', p.url() === BASE + '/hesabim' && (await L('Ad Soyad').waitFor({ timeout: 8000 }).then(() => vals())) === 'Başka Biri|05321112233|', await vals().catch(() => ''));
  await signOut();

  // 8. Şifremi unuttum
  await p.goto(BASE + '/sifremi-unuttum');
  await L('E-posta').fill('abc');
  await p.getByRole('button', { name: 'Kod gönder' }).click();
  check('şifre sıfırlamada bozuk e-posta', (await alertText()) === 'Geçerli bir e-posta adresi gir.', await alertText());
  await L('E-posta').fill(MAIL_A);
  await p.getByRole('button', { name: 'Kod gönder' }).click();
  await p.getByRole('heading', { name: 'Kodu gir' }).waitFor({ timeout: 8000 }).catch(() => {});
  await L('Doğrulama kodu').fill('999999');
  await p.getByRole('button', { name: 'Doğrula' }).click();
  check('sıfırlamada yanlış kod', /Kod hatalı ya da süresi dolmuş/.test(await alertText()), await alertText());
  await L('Doğrulama kodu').fill(GOOD_CODE);
  await p.getByRole('button', { name: 'Doğrula' }).click();
  await p.getByRole('heading', { name: 'Yeni şifreni belirle' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('doğru kod yeni şifre adımını açar', await L('Yeni şifre').isVisible().catch(() => false));
  await L('Yeni şifre').fill('kisa');
  await p.getByRole('button', { name: 'Şifreyi kaydet' }).click();
  check('yeni şifre kısa', (await alertText()) === 'Şifre en az 8 karakter olmalı.', await alertText());
  await L('Yeni şifre').fill(PW1);
  await p.getByRole('button', { name: 'Şifreyi kaydet' }).click();
  check('eski şifreyle aynı', (await alertText()) === 'Yeni şifren eskisiyle aynı olamaz.', await alertText());
  check('hatadan sonra düğme yeniden açık', await p.getByRole('button', { name: 'Şifreyi kaydet' }).isEnabled());
  await L('Yeni şifre').fill(PW2);
  await p.getByRole('button', { name: 'Şifreyi kaydet' }).click();
  await p.waitForURL(BASE + '/hesabim', { timeout: 8000 }).catch(() => {});
  check('yeni şifre sonrası hesabım', p.url() === BASE + '/hesabim', p.url());
  await signOut();
  await login(MAIL_A, PW1);
  check('eski şifre artık geçersiz', (await alertText()) === 'E-posta ya da şifre hatalı.', await alertText());
  await login(MAIL_A, PW2);
  await p.waitForURL(BASE + '/hesabim', { timeout: 8000 }).catch(() => {});
  check('yeni şifreyle giriş', p.url() === BASE + '/hesabim', p.url());

  // 9. Mobil görünüm: menüde hesap bağlantısı
  await p.setViewportSize({ width: 390, height: 800 });
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Menüyü aç' }).click();
  const mobile = (await p.locator('header nav[aria-label="Mobil menü"] a').allTextContents()).join(',');
  check('mobil menüde Hesabım', mobile.includes('Hesabım') && !mobile.includes('Giriş yap'), mobile);

  check('tarayıcı hatası yok', errors.length === 0, errors.join(' || '));
  await b.close();
}

(async () => {
  const build = spawnSync('pnpm', ['exec', 'next', 'build'], { cwd: WEB_DIR, env, stdio: ['ignore', 'ignore', 'inherit'] });
  if (build.status !== 0) throw new Error('Derleme başarısız.');
  const mock = await startMock(MOCK_PORT);
  const site = spawn('pnpm', ['exec', 'next', 'start', '-p', String(SITE_PORT)], { cwd: WEB_DIR, env, stdio: 'ignore', detached: true });
  let crashed = null;
  try {
    await waitForSite();
    await checks();
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
})();
