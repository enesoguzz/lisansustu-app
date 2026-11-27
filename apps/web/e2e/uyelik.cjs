// Üyelik akışlarını (kayıt, linkle doğrulama, giriş, şifre yenileme, Google ile giriş, hesabım) uçtan uca dener.
// Siteyi sahte bir Supabase'e bağlı olarak derleyip yerelde çalıştırır; gerçek projeye istek gitmez, e-posta gönderilmez.
// "E-postadaki link" sahte sunucunun tuttuğu listeden okunur; "başka cihaz" ayrı bir tarayıcı oturumudur.
//
// Çalıştırma (apps/web içinde): pnpm e2e
// Gerekenler: Playwright ve Chromium kurulu olmalı. `.next` klasörünün üzerine yazar.
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');
const { startMock, settings, users, mailsTo, requestLog } = require('./mock-supabase.cjs');

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
  out.push(`${cond ? 'OK  ' : 'HATA'} ${name}${!cond && extra ? ' → ' + extra : ''}`);
}
const stamp = Date.now();
const mail = (tag) => `deneme-${tag}-${stamp}@example.com`;
const MAIL_A = mail('a'); // kayıt, link aynı tarayıcıda
const MAIL_B = mail('b'); // link başka cihazda
const MAIL_C = mail('c'); // yarım kalmış kayıt, link aynı tarayıcıda
const MAIL_D = mail('d'); // yarım kalmış kayıt, link başka cihazda
const MAIL_E = mail('e'); // tekrar gönderilen link aynı tarayıcıda
const MAIL_F = mail('f'); // "Linki tekrar gönder" düğmesi
const MAIL_G = mail('g'); // Google ile gelen yeni üye
const MAIL_H = mail('h'); // doğrulanmamış kaydın üzerine Google ile giriş
const PW1 = 'yerel-deneme-1';
const PW2 = 'yerel-deneme-2';
const PW_OLD = 'yerel-eski-kayit-0';
const WAIT = { timeout: 8000 };

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
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
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

async function checks() {
  const b = await chromium.launch();
  const errors = [];
  /** Ayrı bir tarayıcı oturumu: başka bir cihaz ya da e-posta uygulamasının kendi tarayıcısı gibi davranır. */
  async function device(viewport = { width: 1280, height: 900 }) {
    const ctx = await b.newContext({ viewport });
    ctx.setDefaultTimeout(WAIT.timeout);
    ctx.on('page', (page) => {
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
      });
    });
    return ctx;
  }
  const ctx = await device();
  const p = await ctx.newPage();
  const K = kit(p);
  const { L } = K;
  const lastMail = (email, kind) => mailsTo(email, kind).at(-1);
  const submit = () => p.getByRole('button', { name: 'Hesap oluştur' }).click();
  const proceed = p.getByRole('button', { name: 'Doğruladım, devam et' });
  // Telefon: e-postadaki linklerin "başka cihazda" açıldığı ayrı oturum.
  const m = await (await device({ width: 390, height: 800 })).newPage();
  const M = kit(m);
  let usedLink = BASE + '/dogrula';

  // 1. Oturum yokken
  await section('1', async () => {
    await p.goto(BASE + '/hesabim');
    check('oturumsuz /hesabim girişe yönlenir', await K.arrives('/giris'), p.url());
    check('üst menüde giriş düğmeleri', (await K.headerBtns()) === 'Giriş yap,Ücretsiz başla', await K.headerBtns());
  });

  // 2. Kayıt formu doğrulamaları (sunucuya istek gitmemeli)
  await section('2', async () => {
    await p.goto(BASE + '/kayit');
    await submit();
    check('boş ad', (await K.alert()) === 'Adını ve soyadını yaz.', await K.alert());
    await L('Ad Soyad').fill('  Deneme Kullanıcı ');
    await L('E-posta').fill('abc');
    await submit();
    check('bozuk e-posta', (await K.alert()) === 'Geçerli bir e-posta adresi gir.', await K.alert());
    await L('E-posta').fill('  ' + MAIL_A.toUpperCase() + ' ');
    await L('Şifre', { exact: true }).fill('1234567');
    await submit();
    check('kısa şifre', (await K.alert()) === 'Şifre en az 8 karakter olmalı.', await K.alert());
    await L('Şifre', { exact: true }).fill(PW1);
    await L('Telefon').fill('123');
    await submit();
    check('bozuk telefon', /05xx xxx xx xx/.test(await K.alert()), await K.alert());
    await L('Telefon').fill('+90 532 111 22 33');
    await submit();
    check('onay kutusu işaretsiz', /aydınlatma metnini/.test(await K.alert()), await K.alert());
    check('doğrulama aşamasında sunucuya istek yok', !requestLog.some((l) => l.includes('/signup')));
  });

  // 3. Kayıt, sonra e-postadaki link aynı tarayıcıda açılır
  await section('3', async () => {
    await L('Okuduğun ya da mezun olduğun üniversite').fill('Deneme Üniversitesi');
    await p.getByRole('checkbox').check();
    await submit();
    check('kayıttan sonra "E-postanı kontrol et" adımı açılır', await K.heading('E-postanı kontrol et'));
    check('e-posta küçük harfle ve kırpılmış gösterilir', (await K.main()).includes(MAIL_A + ' adresine bir doğrulama linki gönderdik'), await K.main());
    check('tekrar gönder 60 sn kilitli', await p.getByRole('button', { name: /Yeni link için \d+ sn bekle/ }).isDisabled().catch(() => false));
    const mailA = mailsTo(MAIL_A, 'signup');
    usedLink = mailA[0].link;
    check('tek doğrulama e-postası gider', mailA.length === 1, String(mailA.length));
    check('link kayıt olunan tarayıcıya bağlı ve /dogrula adresine dönüyor', mailA[0].flow === 'pkce' && mailA[0].link.includes(encodeURIComponent(BASE + '/dogrula')), mailA[0].link);
    check('aydınlatma metni onayı kayıtla birlikte işlenir', !!users.get(MAIL_A).profile.kvkk_accepted_at);
    await proceed.click();
    check('link açılmadan devam edilemez', /henüz doğrulanmamış/.test(await K.alert()), await K.alert());
    check('uyarıdan sonra düğme yeniden açık', await proceed.isEnabled());
    const tab = await ctx.newPage();
    const T = kit(tab);
    await tab.goto(mailA[0].link);
    check('link aynı tarayıcıda açılınca hesabıma götürür', await T.arrives('/hesabim'), tab.url());
    check('kayıt sekmesi kendiliğinden hesabıma geçer', await K.arrives('/hesabim'), p.url());
    check('profil kayıttaki bilgilerle dolu', (await K.profile()) === 'Deneme Kullanıcı|05321112233|Deneme Üniversitesi', await K.profile());
    check('hesap sayfasında e-posta görünür', (await p.locator('section p').filter({ visible: true }).first().textContent()) === MAIL_A);
    check('üst menü Hesabım gösterir', (await K.headerBtns()) === 'Hesabım', await K.headerBtns());
    await tab.goto(mailA[0].link);
    check('kullanılmış link, oturum açıkken yine hesabıma götürür', await T.arrives('/hesabim'), tab.url());
    await tab.close();
    check('şifre kayıttaki gibi kalır', users.get(MAIL_A).password === PW1);
  });

  // 4. Profil güncelleme
  await section('4', async () => {
    await L('Üniversite').fill('Yeni Üniversite');
    await p.getByRole('button', { name: 'Kaydet' }).click();
    check('kaydedildi mesajı', (await K.status()) === 'Bilgilerin kaydedildi.', await K.status());
    await L('Telefon').fill('12');
    await p.getByRole('button', { name: 'Kaydet' }).click();
    check('hesabımda bozuk telefon', /05xx xxx xx xx/.test(await K.alert()), await K.alert());
    await p.reload();
    check('yenilemede oturum ve bilgiler korunur', (await K.profile()) === 'Deneme Kullanıcı|05321112233|Yeni Üniversite', await K.profile());
    await p.goto(BASE + '/giris');
    check('oturum açıkken giriş sayfası hesabıma yönlenir', await K.arrives('/hesabim'), p.url());
    await p.goto(BASE + '/kayit');
    check('oturum açıkken kayıt sayfası hesabıma yönlenir', await K.arrives('/hesabim'), p.url());
  });

  // 5. Çıkış ve giriş
  await section('5', async () => {
    await p.getByRole('button', { name: 'Çıkış yap' }).click();
    check('çıkış ana sayfaya götürür', await K.arrives('/'), p.url());
    check('çıkıştan sonra giriş düğmeleri', (await K.headerBtns()) === 'Giriş yap,Ücretsiz başla', await K.headerBtns());
    await p.goto(BASE + '/hesabim');
    check('çıkıştan sonra /hesabim kapalı', await K.arrives('/giris'), p.url());
    await p.goto(usedLink);
    check('kullanılmış link oturum yokken uyarı verir', await K.heading('Bu link kullanılamıyor'));
    check('hata bilgisi adres çubuğunda kalmaz', p.url() === BASE + '/dogrula', p.url());
    await p.locator('main').getByRole('link', { name: 'Giriş yap' }).click();
    check('uyarıdan giriş sayfasına geçilir', await K.arrives('/giris'), p.url());
    await p.goto(BASE + '/dogrula');
    check('link olmadan /dogrula girişe yönlenir', await K.arrives('/giris'), p.url());

    await p.goto(BASE + '/giris');
    await p.locator('form button[type=submit]').filter({ visible: true }).click();
    check('boş giriş', (await K.alert()) === 'E-posta ve şifreni yaz.', await K.alert());
    await K.login(MAIL_A, 'yanlis-sifre-9');
    check('yanlış şifre mesajı', /^E-posta ya da şifre hatalı\./.test(await K.alert()), await K.alert());
    await K.login(MAIL_A, PW1);
    check('doğru şifre hesabıma götürür', await K.arrives('/hesabim'), p.url());
    await p.waitForTimeout(700);
    check('girişten sonra şifre sayfada kalmaz', (await K.pwValues()) === 0, 'dolu şifre alanı: ' + (await K.pwValues()));
    await K.signOut();
    // Çıkıştan sonra menüden girişe dönülünce form temiz ve kullanılabilir olmalı
    await p.locator('header').getByRole('link', { name: 'Giriş yap' }).click();
    await K.heading('Tekrar hoş geldin');
    check('çıkış sonrası giriş formu temiz', (await L('E-posta').inputValue()) === '' && (await L('Şifre', { exact: true }).inputValue()) === '' && (await p.locator('form button[type=submit]').filter({ visible: true }).textContent()) === 'Giriş yap');

    // Sayfalar arası geçişte yazılan şifre saklanmamalı
    await L('E-posta').fill('gecici@example.com');
    await L('Şifre', { exact: true }).fill('yerel-deneme-9');
    await p.locator('main').getByRole('link', { name: 'Ücretsiz başla' }).click();
    await K.heading('Ücretsiz hesap oluştur');
    await p.waitForTimeout(700);
    check('sayfadan çıkınca şifre arka planda kalmaz', (await K.pwValues()) === 0, 'dolu şifre alanı: ' + (await K.pwValues()));
    await p.locator('main').getByRole('link', { name: 'Giriş yap' }).click();
    await K.heading('Tekrar hoş geldin');
    check('geri dönünce giriş formu boş', (await L('E-posta').inputValue()) === '' && (await L('Şifre', { exact: true }).inputValue()) === '');
  });

  // 6. Aynı e-postayla ikinci kayıt
  await section('6', async () => {
    await K.signup({ name: 'Başka Biri', email: MAIL_A, password: PW1 });
    check('kayıtlı e-posta mesajı', /zaten bir hesap var/.test(await K.alert()), await K.alert());
    check('kayıtlı e-postaya yeni doğrulama e-postası gitmez', mailsTo(MAIL_A, 'signup').length === 1);
    settings.unauthorizedEmail = mail('disarida');
    await L('E-posta').fill(settings.unauthorizedEmail);
    await submit();
    check('e-posta servisinin göndermediği adreste anlaşılır uyarı', /henüz herkese açık değil/.test(await K.alert()), await K.alert());
  });

  // 7. Kaydı yarım kalan üye giriş yapınca yeni link gider; link başka bir cihazda açılır
  await section('7', async () => {
    await L('E-posta').fill(MAIL_B);
    await submit();
    await K.heading('E-postanı kontrol et');
    await p.locator('header').getByRole('link', { name: 'Giriş yap' }).click();
    await K.heading('Tekrar hoş geldin');
    await p.locator('header').getByRole('link', { name: 'Ücretsiz başla' }).click();
    await K.heading('Ücretsiz hesap oluştur');
    check('bekleme adımından çıkıp dönünce kayıt formu baştan başlar', (await p.getByRole('button', { name: 'Hesap oluştur' }).isVisible()) && (await L('Ad Soyad').inputValue()) === '');
    await K.login(MAIL_B, PW1);
    await p.getByText('Giriş yapmadan önce e-postanı doğrulaman gerekiyor.').waitFor(WAIT).catch(() => {});
    check('doğrulanmamış üye bekleme adımına alınır', await proceed.isVisible().catch(() => false));
    const mailB = mailsTo(MAIL_B, 'signup');
    check('yarım kayıtta yeni link gönderilir', mailB.length === 2 && requestLog.filter((l) => l.includes('/resend')).length === 1, String(mailB.length));
    check('yeni link de /dogrula adresine dönüyor', mailB[1].link.includes(encodeURIComponent(BASE + '/dogrula')), mailB[1].link);
    await m.goto(mailB[0].link);
    check('yeni link istenince eski link geçersiz olur', await M.heading('Bu link kullanılamıyor'));
    await m.goto(mailB[1].link);
    check('link başka cihazda açılınca "E-postan doğrulandı" denir', await M.heading('E-postan doğrulandı'));
    check('oturum bilgisi adres çubuğunda kalmaz', m.url() === BASE + '/dogrula', m.url());
    await m.goto(BASE + '/hesabim');
    check('linkteki bilgiyle başka cihazda oturum açılmaz', await M.arrives('/giris'), m.url());
    await proceed.click();
    check('"Doğruladım, devam et" hesabıma götürür', await K.arrives('/hesabim'), p.url());
    check('okul boş bırakılmış kayıt', (await K.profile()) === 'Başka Biri|05321112233|', await K.profile());
    await K.signOut();
  });

  // 8. Aynı e-postayla daha önce başlanıp yarım kalmış kayıt (şifresi başka)
  await section('8', async () => {
    const old = await device();
    const o = await old.newPage();
    await kit(o).signup({ name: 'Eski Kayıt', email: MAIL_C, password: PW_OLD, phone: '05550000000' });
    await kit(o).signup({ name: 'Eski Kayıt', email: MAIL_D, password: PW_OLD, phone: '05550000000' });
    await old.close();
    await K.signup({ name: 'Yeni Kayıt', email: MAIL_C, password: PW1 });
    check('yarım kayıtta sunucu ilk şifreyi saklar', users.get(MAIL_C).password === PW_OLD);
    const tabC = await ctx.newPage();
    await tabC.goto(lastMail(MAIL_C).link);
    check('yarım kayıt: link aynı tarayıcıda açılınca hesabım', await kit(tabC).arrives('/hesabim'), tabC.url());
    await tabC.close();
    check('yarım kayıt: kayıt sekmesi de hesabıma geçer', await K.arrives('/hesabim'), p.url());
    check('yarım kayıt: geçerli şifre az önce yazılan olur', await eventually(() => users.get(MAIL_C).password === PW1));
    await K.signOut();
    await K.login(MAIL_C, PW1);
    check('yarım kayıt: yeni şifreyle giriş', await K.arrives('/hesabim'), p.url());
    await K.signOut();

    await K.signup({ name: 'Yeni Kayıt', email: MAIL_D, password: PW1 });
    await m.goto(lastMail(MAIL_D).link);
    check('tarayıcıya bağlı link başka cihazda da e-postayı doğrular', (await M.heading('E-postan doğrulandı')) && users.get(MAIL_D).confirmed);
    await proceed.click();
    check('yarım kayıt başka cihazda doğrulanırsa şifre yenilemeye yönlendirilir', /Şifremi unuttum/.test(await K.alert()), await K.alert());
    check('oturum açılmadan şifre değişmez', users.get(MAIL_D).password === PW_OLD);
  });

  // 9. Tekrar gönderilen link aynı tarayıcıda açılır; kayıt sekmesine dönünce kendiliğinden devam edilir
  await section('9', async () => {
    await K.signup({ name: 'Sekme Deneme', email: MAIL_E, password: PW1 });
    settings.mailCooldownMs = 60_000;
    await K.login(MAIL_E, PW1);
    await p.getByText('Giriş yapmadan önce e-postanı doğrulaman gerekiyor.').waitFor(WAIT).catch(() => {});
    check('girişte yeni link gönderilemezse nedeni söylenir', /Çok sık e-posta istendi/.test(await K.alert()) && mailsTo(MAIL_E).length === 1, await K.alert());
    settings.mailCooldownMs = 0;
    await K.login(MAIL_E, PW1);
    await p.getByText('Giriş yapmadan önce e-postanı doğrulaman gerekiyor.').waitFor(WAIT).catch(() => {});
    check('link gönderilebildiğinde uyarı yok', (await K.alert()) === '(yok)' && mailsTo(MAIL_E).length === 2, await K.alert());
    const tabE = await ctx.newPage();
    await tabE.goto(lastMail(MAIL_E).link);
    check('tarayıcıya bağlı olmayan link oturum açmaz, giriş ister', (await kit(tabE).heading('E-postan doğrulandı')) && (await kit(tabE).headerBtns()) === 'Giriş yap,Ücretsiz başla');
    await tabE.close();
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    check('bekleme sekmesine dönünce kendiliğinden hesabıma geçilir', await K.arrives('/hesabim'), p.url());
    await K.signOut();
  });

  // 10. Şifremi unuttum: link başka bir cihazda açılır
  await section('10', async () => {
    await p.goto(BASE + '/sifremi-unuttum');
    await L('E-posta').fill('abc');
    await p.getByRole('button', { name: 'Link gönder' }).click();
    check('şifre yenilemede bozuk e-posta', (await K.alert()) === 'Geçerli bir e-posta adresi gir.', await K.alert());
    await L('E-posta').fill(mail('yok'));
    await p.getByRole('button', { name: 'Link gönder' }).click();
    check('kayıtlı olmayan e-postada da aynı ekran, e-posta gitmez', (await K.heading('E-postanı kontrol et')) && mailsTo(mail('yok')).length === 0);
    await p.goto(BASE + '/sifremi-unuttum');
    await L('E-posta').fill(MAIL_A);
    await p.getByRole('button', { name: 'Link gönder' }).click();
    await K.heading('E-postanı kontrol et');
    check('şifre yenileme linki gönderildi ekranı', (await K.main()).includes(MAIL_A + ' adresine şifre yenileme linki gönderdik'), await K.main());
    check('şifre yenilemede "devam et" düğmesi yok', !(await proceed.isVisible()));
    const reset = lastMail(MAIL_A, 'recovery');
    check('şifre yenileme linki her cihazda açılabilir ve /sifre-yenile adresine dönüyor', reset && reset.flow === 'implicit' && reset.link.includes(encodeURIComponent(BASE + '/sifre-yenile')), reset && reset.link);
    await m.goto(reset.link);
    check('link başka cihazda yeni şifre adımını açar', (await M.heading('Yeni şifreni belirle')) && (await M.main()).includes(MAIL_A));
    check('şifre yenilemede oturum bilgisi adres çubuğunda kalmaz', m.url() === BASE + '/sifre-yenile', m.url());
    const save = m.getByRole('button', { name: 'Şifreyi kaydet' });
    await M.L('Yeni şifre').fill('kisa');
    await save.click();
    check('yeni şifre kısa', (await M.alert()) === 'Şifre en az 8 karakter olmalı.', await M.alert());
    await M.L('Yeni şifre').fill(PW1);
    await save.click();
    check('eski şifreyle aynı', (await M.alert()) === 'Yeni şifren eskisiyle aynı olamaz.', await M.alert());
    check('hatadan sonra düğme yeniden açık', await save.isEnabled());
    await m.reload();
    check('sayfa yenilenince yeni şifre adımı kaybolmaz', await M.heading('Yeni şifreni belirle'));
    await M.L('Yeni şifre').fill(PW2);
    await save.click();
    check('yeni şifre sonrası hesabım', await M.arrives('/hesabim'), m.url());
    await m.goto(BASE + '/sifre-yenile');
    check('link olmadan şifre yenileme adımı açılmaz', await M.heading('Bu link kullanılamıyor'));
    await M.signOut();
    await m.goto(reset.link);
    check('kullanılmış şifre yenileme linki uyarı verir', await M.heading('Bu link kullanılamıyor'));
    await m.getByRole('link', { name: 'Yeni link iste' }).click();
    check('uyarıdan yeni link isteme sayfasına geçilir', await M.arrives('/sifremi-unuttum'), m.url());
    await K.login(MAIL_A, PW1);
    check('eski şifre artık geçersiz', /^E-posta ya da şifre hatalı\./.test(await K.alert()), await K.alert());
    await K.login(MAIL_A, PW2);
    check('yeni şifreyle giriş', await K.arrives('/hesabim'), p.url());
    await K.signOut();
  });

  // 11. "Linki tekrar gönder" düğmesi (60 saniyelik bekleme, sayfanın saati ileri alınarak geçilir)
  await section('11', async () => {
    settings.resendFlow = 'pkce';
    const clocked = await device();
    const c = await clocked.newPage();
    const C = kit(c);
    await c.clock.install();
    await C.signup({ name: 'Tekrar Gönder', email: MAIL_F, password: PW1 });
    const again = c.getByRole('button', { name: 'Linki tekrar gönder' });
    check('süre dolmadan tekrar gönderilemez', !(await again.isVisible()));
    settings.mailCooldownMs = 60_000;
    await c.clock.fastForward(61_000);
    await again.click(WAIT).catch(() => {});
    check('sunucu sınırı aşılırsa anlaşılır uyarı', /Çok sık e-posta istendi/.test(await C.alert()), await C.alert());
    settings.mailCooldownMs = 0;
    await c.clock.fastForward(61_000);
    await again.click(WAIT).catch(() => {});
    check('yeni link gönderildi mesajı', /Yeni link gönderildi/.test(await C.status()), await C.status());
    check('tekrar gönderimden sonra düğme yeniden kilitlenir', !(await again.isVisible()));
    const mailF = mailsTo(MAIL_F, 'signup');
    check('ikinci e-posta gider', mailF.length === 2, String(mailF.length));
    const tabF = await clocked.newPage();
    await tabF.goto(mailF[0].link);
    check('tekrar gönderimden sonra ilk link geçersiz', await kit(tabF).heading('Bu link kullanılamıyor'));
    await tabF.goto(mailF[1].link);
    check('tekrar gönderilen link aynı tarayıcıda hesabıma götürür', await kit(tabF).arrives('/hesabim'), tabF.url());
    check('tekrar gönderimde de kayıt sekmesi hesabıma geçer', await C.arrives('/hesabim'), c.url());
    await clocked.close();
    settings.resendFlow = 'implicit';
  });

  // 12. Google ile giriş
  await section('12', async () => {
    settings.google = { email: MAIL_G, name: 'Gülşen Örnek' };
    const g = await (await device()).newPage();
    const G = kit(g);
    await g.goto(BASE + '/giris');
    const googleBtn = g.getByRole('button', { name: 'Google ile devam et' });
    await googleBtn.click();
    await g.waitForURL((u) => u.pathname === '/auth/v1/authorize', WAIT).catch(() => {});
    const asked = new URL(g.url()).searchParams;
    check('Google isteğinde dönüş adresi, hesap seçtirme ve tarayıcıya bağlama var', asked.get('provider') === 'google' && asked.get('redirect_to') === BASE + '/giris/google' && asked.get('prompt') === 'select_account' && !!asked.get('code_challenge'), g.url());
    await g.goBack();
    check('Google ekranından geri dönülünce düğme kullanılabilir', (await googleBtn.isEnabled()) && (await googleBtn.textContent()) === 'Google ile devam et');
    await G.google('#devam');
    check('Google ile yeni üye hesabıma gelir', await G.arrives('/hesabim'), g.url());
    check('yeni Google üyesinden eksik bilgiler istenir', await G.heading('Son bir adım'));
    check('ad Google hesabından gelir, telefon boştur', (await G.profile()) === 'Gülşen Örnek||', await G.profile());
    const complete = g.getByRole('button', { name: 'Hesabımı tamamla' });
    await complete.click();
    check('tamamlamada telefon zorunlu', /05xx xxx xx xx/.test(await G.alert()), await G.alert());
    await G.L('Telefon').fill('0544 333 22 11');
    await complete.click();
    check('tamamlamada aydınlatma metni onayı zorunlu', /aydınlatma metnini/.test(await G.alert()), await G.alert());
    check('onay verilmeden hiçbir şey kaydedilmez', users.get(MAIL_G).profile.phone === null);
    await g.getByRole('checkbox').check();
    await complete.click();
    check('tamamlanınca "Hesabın hazır."', (await G.status()) === 'Hesabın hazır.', await G.status());
    check('tamamlanınca normal hesap sayfası görünür', (await G.heading('Hesabım')) && (await g.getByRole('checkbox').count()) === 0 && (await g.getByRole('button', { name: 'Kaydet' }).isVisible()));
    const gp = users.get(MAIL_G).profile;
    check('telefon ve onay zamanı kaydedilir', gp.phone === '05443332211' && !!gp.kvkk_accepted_at, JSON.stringify(gp));
    await g.reload();
    check('yenilemede tamamlanmış hesap', (await G.heading('Hesabım')) && (await G.profile()) === 'Gülşen Örnek|05443332211|', await G.profile());
    await G.signOut();
    await g.goto(BASE + '/kayit');
    await G.google('#devam');
    check('kayıtlı Google üyesi doğrudan hesabına girer', (await G.arrives('/hesabim')) && (await G.heading('Hesabım')), g.url());
    await G.signOut();
    await g.goto(BASE + '/giris');
    await G.google('#vazgec');
    check('Google ekranında vazgeçilirse anlaşılır uyarı', (await G.heading('Giriş tamamlanamadı')) && (await G.main()).includes('Google ekranında giriş tamamlanmadı.'), await G.main());
    check('Google hatası adres çubuğunda kalmaz', g.url() === BASE + '/giris/google', g.url());
    await g.getByRole('link', { name: 'Tekrar dene' }).click();
    check('uyarıdan girişe dönülür', await G.arrives('/giris'), g.url());
    await G.login(MAIL_G, 'herhangi-bir-9');
    check('Google üyesi şifreyle girmeye çalışırsa yol gösterilir', /Google ile kayıt olduysan/.test(await G.alert()), await G.alert());
    await G.signup({ name: 'Gülşen Örnek', email: MAIL_G, password: PW1 });
    check('Google üyesinin e-postasıyla yeniden kayıt olunamaz', /zaten bir hesap var/.test(await G.alert()), await G.alert());
    settings.google = { email: MAIL_A, name: 'Deneme Kullanıcı' };
    await g.goto(BASE + '/giris');
    await G.google('#devam');
    check('e-postayla kayıtlı üye Google ile aynı hesaba girer', (await G.arrives('/hesabim')) && (await G.profile()) === 'Deneme Kullanıcı|05321112233|Yeni Üniversite', await G.profile());
    await G.signOut();
    await G.signup({ name: 'Yarım Kayıt', email: MAIL_H, password: PW1 });
    settings.google = { email: MAIL_H, name: 'Hakan Örnek' };
    await g.goto(BASE + '/giris');
    await G.google('#devam');
    check('doğrulanmamış kaydın üzerine Google ile girilebilir', (await G.arrives('/hesabim')) && (await G.heading('Hesabım')), g.url());
    await G.signOut();
  });

  // 13. Mobil görünüm: menüde hesap bağlantısı
  await section('13', async () => {
    await K.login(MAIL_A, PW2);
    await K.arrives('/hesabim');
    await p.setViewportSize({ width: 390, height: 800 });
    await p.goto(BASE + '/');
    await p.getByRole('button', { name: 'Menüyü aç' }).click();
    const mobile = (await p.locator('header nav[aria-label="Mobil menü"] a').allTextContents()).join(',');
    check('mobil menüde Hesabım', mobile.includes('Hesabım') && !mobile.includes('Giriş yap'), mobile);
  });

  // 14. Telefon ekranı: uzun formda uyarı düğmeyle birlikte görünür, bekleme adımı sayfanın başından açılır
  await section('14', async () => {
    /** Öğe, üstteki sabit menünün altında ve ekranın içinde mi? */
    const onScreen = (locator) =>
      locator.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= document.querySelector('header').getBoundingClientRect().bottom && box.bottom <= window.innerHeight;
      });
    await M.signOut();
    await m.goto(BASE + '/kayit');
    const create = m.getByRole('button', { name: 'Hesap oluştur' });
    await create.click();
    const warning = m.locator('main [role=alert]').filter({ visible: true }).first();
    await warning.waitFor(WAIT).catch(() => {});
    check('telefonda kayıt uyarısı düğmeyle aynı ekranda', (await m.evaluate(() => window.scrollY)) > 0 && (await onScreen(warning)) && (await onScreen(create)));
    await M.signup({ name: 'Telefon Deneme', email: mail('t'), password: PW1 });
    check('telefonda bekleme adımı sayfanın başından açılır', (await m.evaluate(() => window.scrollY)) === 0 && (await onScreen(m.getByRole('heading', { name: 'E-postanı kontrol et', level: 1 }))));
    const go = m.getByRole('button', { name: 'Doğruladım, devam et' });
    await go.click();
    await warning.waitFor(WAIT).catch(() => {});
    check('telefonda bekleme uyarısı düğmeyle aynı ekranda', (await onScreen(warning)) && (await onScreen(go)));
  });

  check('tarayıcı hatası yok', errors.length === 0, errors.join(' || '));
  await b.close();
}

(async () => {
  const build = spawnSync('pnpm', ['exec', 'next', 'build'], { cwd: WEB_DIR, env, stdio: ['ignore', 'ignore', 'inherit'] });
  if (build.status !== 0) throw new Error('Derleme başarısız.');
  settings.siteUrl = BASE;
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
