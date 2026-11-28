// Üyelik akışlarını (kayıt, linkle doğrulama, giriş, şifre yenileme, Google ile giriş, hesabım) uçtan uca dener.
// "E-postadaki link" sahte sunucunun tuttuğu listeden okunur; "başka cihaz" ayrı bir tarayıcı oturumudur.
//
// Çalıştırma (apps/web içinde): pnpm e2e (bütün takımlar) ya da yalnızca bu takım için node e2e/uyelik.cjs
// Ortak düzen (derleme, sahte Supabase, yardımcılar): e2e/harness.cjs
const { BASE, WAIT, check, section, eventually, kit, openBrowser, main } = require('./harness.cjs');
const { settings, users, mailsTo, requestLog, unexpectedRequests, tokensFor, addMember, sql } = require('./mock-supabase.cjs');

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
const MAIL_I = mail('i'); // Türkçe klavyede büyük harfle yazılan adres
const MAIL_J = mail('j'); // profil satırı olmayan hesap
const PW1 = 'yerel-deneme-1';
const PW2 = 'yerel-deneme-2';
const PW3 = 'yerel-deneme-3';
const PW4 = 'yerel-deneme-4';
const PW_OLD = 'yerel-eski-kayit-0';

async function checks() {
  const { browser: b, device, errors } = await openBrowser();
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
    await proceed.click();
    check('yarım kayıt: link açılmadan "doğrulandı" denmez, linke tıklaması söylenir', /henüz tıklamadıysan/.test(await K.alert()) && !/doğrulandı/.test(await K.alert()), await K.alert());
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
    check('link gönderilemediyse "gönderdik" denmez', /gönderemedik/.test(await K.main()) && !/linki gönderdik/.test(await K.main()), await K.main());
    settings.mailCooldownMs = 0;
    await K.login(MAIL_E, PW1);
    await p.getByText('Giriş yapmadan önce e-postanı doğrulaman gerekiyor.').waitFor(WAIT).catch(() => {});
    check('link gönderilebildiğinde uyarı yok', (await K.alert()) === '(yok)' && mailsTo(MAIL_E).length === 2, await K.alert());
    check('link gönderildiyse öyle yazar', /bir doğrulama linki gönderdik/.test(await K.main()), await K.main());
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
    check('eksik bilgi adımında hangi hesap olduğu yazar', (await G.main()).includes(MAIL_G + ' hesabını tamamlamak'), await G.main());
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

  /** Hesap sayfasının başlığı altında yazan e-posta. */
  const accountEmail = (page) => page.locator('section p').filter({ visible: true }).first().textContent();
  /** Bir üyenin oturum bilgisini taşıyan şifre yenileme adresi (gerçek linkin vardığı adresle aynı biçimde). */
  const resetUrl = (t) => `${BASE}/sifre-yenile#access_token=${t.access_token}&refresh_token=${t.refresh_token}&type=recovery`;
  const localLogouts = () => requestLog.filter((l) => l.startsWith('POST /auth/v1/logout?scope=local')).length;

  // 15. Şifre yenileme linkindeki oturum, sitenin oturumuna yazılmaz
  await section('15', async () => {
    const victim = await device();
    const v = await victim.newPage();
    const V = kit(v);
    await V.login(MAIL_A, PW2);
    await V.arrives('/hesabim');
    // MAIL_B'nin sahibi kendi oturum bilgisini bir linke yazıp MAIL_A'nın sahibine gönderiyor.
    const other = tokensFor(MAIL_B);
    await v.goto(resetUrl(other));
    check('başkasının linki yalnızca o hesabın şifre adımını açar ve hesabı yazar', (await V.heading('Yeni şifreni belirle')) && (await V.main()).includes(MAIL_B + ' hesabının yeni şifresini'), await V.main());
    const tab = await victim.newPage();
    const T = kit(tab);
    await tab.goto(BASE + '/hesabim');
    await T.profile();
    check('başkasının linki açık olan oturumu değiştirmez', (await accountEmail(tab)) === MAIL_A, await accountEmail(tab));
    // Süresi yazmayan uydurma bir oturum bilgisiyle (yalnızca yenileme anahtarı gerçek) de sonuç aynı olmalı.
    await v.goto(resetUrl({ access_token: 'e30.e30.e30', refresh_token: other.refresh_token }));
    check('uydurma oturum bilgisi de yalnızca şifre adımını açar', (await V.heading('Yeni şifreni belirle')) && (await V.main()).includes(MAIL_B), await V.main());
    await tab.reload();
    await T.profile();
    check('uydurma oturum bilgisi de açık olan oturumu değiştirmez', (await accountEmail(tab)) === MAIL_A, await accountEmail(tab));
    await victim.close();

    const fresh = await device();
    const f = await fresh.newPage();
    await f.goto(resetUrl(other));
    await kit(f).heading('Yeni şifreni belirle');
    const f2 = await fresh.newPage();
    await f2.goto(BASE + '/hesabim');
    check('oturumu olmayan tarayıcıda link site oturumu açmaz', await kit(f2).arrives('/giris'), f2.url());
    check('linkten site oturumu çerezi yazılmaz', !(await fresh.cookies()).some((c) => /-auth-token(\.\d+)?$/.test(c.name)), (await fresh.cookies()).map((c) => c.name).join(','));
    await f2.goto(`${BASE}/sifre-yenile?access_token=${other.access_token}&refresh_token=${other.refresh_token}`);
    check('soru işaretinden sonra yazılmış oturum bilgisi işlenmez', (await kit(f2).heading('Bu link kullanılamıyor')) && f2.url() === BASE + '/sifre-yenile', f2.url());
    check('şifre adımı açılıp bırakılınca şifre değişmez', users.get(MAIL_B).password === PW1);
    await fresh.close();
  });

  // 16. Yeni şifre, formda adı yazan hesaba kaydedilir; o sırada sitede başka hesap açık olsa da
  await section('16', async () => {
    const shared = await device();
    const a = await shared.newPage();
    const A = kit(a);
    await a.goto(resetUrl(tokensFor(MAIL_C)));
    await A.heading('Yeni şifreni belirle');
    const b2 = await shared.newPage();
    await kit(b2).login(MAIL_A, PW2);
    await kit(b2).arrives('/hesabim');
    const closedBefore = localLogouts();
    await A.L('Yeni şifre').fill(PW3);
    await a.getByRole('button', { name: 'Şifreyi kaydet' }).click();
    check('yeni şifre, formda adı yazan hesaba kaydedilir', await eventually(() => users.get(MAIL_C).password === PW3));
    check('o sırada sitede açık olan hesabın şifresi değişmez', users.get(MAIL_A).password === PW2);
    check('şifre kaydedilince o hesapla oturum açılır', (await A.arrives('/hesabim')) && (await A.profile()) !== '' && (await accountEmail(a)) === MAIL_C, await accountEmail(a));
    check('şifre yenileme oturumu sekmede bırakılmaz', (await a.evaluate(() => window.sessionStorage.getItem('sb-sifre-yenileme'))) === null);
    check('şifre yenileme oturumu sunucuda da kapatılır', await eventually(() => localLogouts() === closedBefore + 1), String(localLogouts() - closedBefore));
    await shared.close();
  });

  // 17. Şifre yenilemede bağlantı sorunları: link yanmaz, ne olduğu söylenir
  await section('17', async () => {
    const ctx17 = await device();
    const r = await ctx17.newPage();
    const R = kit(r);
    const link = resetUrl(tokensFor(MAIL_C));
    await r.route('**/auth/v1/user', (route) => route.abort());
    await r.goto(link);
    check('sunucuya ulaşılamazsa link yanmaz', (await R.heading('Link kontrol edilemedi')) && r.url() === link, r.url());
    await r.unrouteAll({ behavior: 'wait' });
    await r.getByRole('button', { name: 'Tekrar dene' }).click();
    check('tekrar denenince yeni şifre adımı açılır', (await R.heading('Yeni şifreni belirle')) && r.url() === BASE + '/sifre-yenile', r.url());
    const save = r.getByRole('button', { name: 'Şifreyi kaydet' });
    await R.L('Yeni şifre').fill('ş'.repeat(37));
    await save.click();
    check('yeni şifre çok uzun', /^Şifre çok uzun\./.test(await R.alert()), await R.alert());
    await r.route('**/auth/v1/user', (route) => route.abort());
    await R.L('Yeni şifre').fill(PW4);
    await save.click();
    check('kaydederken bağlantı koparsa anlaşılır uyarı, şifre değişmez', /^Sunucuya ulaşılamadı\./.test(await R.alert()) && users.get(MAIL_C).password === PW3, await R.alert());
    await r.unrouteAll({ behavior: 'wait' });
    // Şifre kaydedilir ama ardından oturum açılamaz
    await r.route((url) => url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password', (route) => route.abort());
    await save.click();
    check('şifre kaydedilip oturum açılamazsa girişe yönlendirilir', (await R.heading('Şifren değişti')) && users.get(MAIL_C).password === PW4);
    await r.unrouteAll({ behavior: 'wait' });
    await r.locator('main').getByRole('link', { name: 'Giriş yap' }).click();
    await R.arrives('/giris');
    await R.L('E-posta').fill(MAIL_C);
    await R.L('Şifre', { exact: true }).fill(PW4);
    await r.locator('form button[type=submit]').filter({ visible: true }).click();
    check('ardından yeni şifreyle giriş yapılır', (await R.arrives('/hesabim')) && (await R.profile()) !== '' && (await accountEmail(r)) === MAIL_C, r.url());
    // Form açıkken linkin oturumu kaybolursa (örneğin süresi dolarsa) boşuna "tekrar dene" denmez
    await r.goto(resetUrl(tokensFor(MAIL_C)));
    await R.heading('Yeni şifreni belirle');
    await r.evaluate(() => window.sessionStorage.removeItem('sb-sifre-yenileme'));
    await R.L('Yeni şifre').fill(PW3);
    await r.getByRole('button', { name: 'Şifreyi kaydet' }).click();
    check('linkin oturumu kaybolmuşsa yeni link istenir', (await R.heading('Bu link kullanılamıyor')) && users.get(MAIL_C).password === PW4);
    await ctx17.close();
  });

  // 18. Hesabım: bilgiler yüklenemezse eksik bilgi formu gösterilmez
  await section('18', async () => {
    const ctx18 = await device();
    const h = await ctx18.newPage();
    const H = kit(h);
    await H.login(MAIL_A, PW2);
    await H.arrives('/hesabim');
    await H.profile();
    const profileReads = () => requestLog.filter((l) => l.startsWith('GET /rest/v1/profiles') && l.includes('full_name')).length;
    const readsBefore = profileReads();
    // Sekmeye her dönüşte oturum yeniden doğrulanır; profil bu yüzden yeniden istenmemeli.
    await h.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await h.waitForTimeout(700);
    check('sekmeye dönünce profil yeniden istenmez', profileReads() === readsBefore, String(profileReads() - readsBefore));
    await h.route('**/rest/v1/profiles*', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'deneme' }) }) : route.continue(),
    );
    await h.reload();
    const retry = h.getByRole('button', { name: 'Tekrar dene' });
    await retry.waitFor(WAIT).catch(() => {});
    check('bilgiler yüklenemezse nedeni yazar', /^Bilgilerin yüklenemedi\./.test(await H.alert()), await H.alert());
    check(
      'bilgiler yüklenemezse eksik bilgi formu ve onay kutusu gösterilmez',
      (await H.heading('Hesabım')) && (await h.getByLabel('Ad Soyad').count()) === 0 && (await h.getByRole('checkbox').count()) === 0 && (await h.getByRole('button', { name: 'Hesabımı tamamla' }).count()) === 0,
      await H.main(),
    );
    check('bilgiler yüklenemese de hangi hesap olduğu yazar', (await accountEmail(h)) === MAIL_A, await accountEmail(h));
    await h.unrouteAll({ behavior: 'wait' });
    await retry.click();
    check('tekrar denenince bilgiler gelir', (await H.profile()) === 'Deneme Kullanıcı|05321112233|Yeni Üniversite', await H.profile());
    check('bilgiler gelince uyarı kalmaz', (await h.locator('main [role=alert]').count()) === 0);
    check('yükleme hatası kayıtlı bilgileri bozmaz', users.get(MAIL_A).profile.school === 'Yeni Üniversite');
    await H.signOut();

    // Profil satırı olmayan hesap: kaydedilemeyecek bir form yerine durumu söyleyen bir uyarı
    const lost = await addMember({ email: MAIL_J, password: PW1, name: 'Satırsız Üye' });
    await sql('delete from public.profiles where id = $1', [lost.id]);
    await H.login(MAIL_J, PW1);
    await H.arrives('/hesabim');
    await retry.waitFor(WAIT).catch(() => {});
    check('profil satırı olmayan hesapta form yerine uyarı', /bilgileri bulunamadı/.test(await H.alert()) && (await h.getByLabel('Ad Soyad').count()) === 0, await H.main());
    await H.signOut();
    check('uyarı ekranından da çıkış yapılabilir', (await H.headerBtns()) === 'Giriş yap,Ücretsiz başla', await H.headerBtns());
    await ctx18.close();
  });

  // 19. Çıkış: yalnızca bu cihaz, bağlantı olmasa da
  await section('19', async () => {
    const ctx19 = await device();
    const s = await ctx19.newPage();
    const S = kit(s);
    await S.login(MAIL_A, PW2);
    await S.arrives('/hesabim');
    await s.goto(BASE + '/');
    await s.goto(BASE + '/hesabim');
    await S.profile();
    await s.route('**/auth/v1/logout*', (route) => route.abort());
    await s.getByRole('button', { name: 'Çıkış yap' }).click();
    check('bağlantı yokken de bu tarayıcıdan çıkış yapılır', (await S.arrives('/')) && (await S.headerBtns()) === 'Giriş yap,Ücretsiz başla', s.url());
    await s.unrouteAll({ behavior: 'wait' });
    await s.goBack();
    check('çıkıştan sonra "Geri" tuşu hesap sayfasına dönmez', s.url() === BASE + '/', s.url());
    await s.goto(BASE + '/hesabim');
    check('çıkıştan sonra hesap sayfası kapalı', await S.arrives('/giris'), s.url());
    const logouts = requestLog.filter((l) => l.startsWith('POST /auth/v1/logout'));
    check('çıkış yalnızca bu cihazdaki oturumu kapatır', logouts.length > 0 && logouts.every((l) => l.includes('scope=local')), logouts.filter((l) => !l.includes('scope=local')).join(' | '));
    await ctx19.close();
  });

  // 20. Türkçe klavye ve uzun şifre
  await section('20', async () => {
    const ctx20 = await device();
    const f = await ctx20.newPage();
    const F = kit(f);
    const create = f.getByRole('button', { name: 'Hesap oluştur' });
    const signups = () => requestLog.filter((l) => l.includes('/signup')).length;
    const before = signups();
    await f.goto(BASE + '/kayit');
    await F.L('Ad Soyad').fill('İbrahim Deneme');
    await F.L('E-posta').fill('şule@example.com');
    await F.L('Şifre', { exact: true }).fill('a'.repeat(73));
    await F.L('Telefon').fill('+90 0532 111 22 33');
    await f.getByRole('checkbox').check();
    await create.click();
    check('e-postada Türkçe harf için ayrı uyarı', (await F.alert()) === 'E-posta adresinde Türkçe harf (ç, ğ, ı, ö, ş, ü) olamaz.', await F.alert());
    // Türkçe klavyede Caps Lock açıkken yazılmış adres: "i" tuşu "İ" yazar.
    await F.L('E-posta').fill(MAIL_I.toUpperCase().replace(/I/g, 'İ'));
    await create.click();
    check('kayıtta çok uzun şifre', /^Şifre çok uzun\./.test(await F.alert()), await F.alert());
    check('bu uyarılarda sunucuya istek gitmez', signups() === before, String(signups() - before));
    await F.L('Şifre', { exact: true }).fill(PW1);
    await create.click();
    await F.heading('E-postanı kontrol et');
    check('büyük İ ile yazılan e-posta doğru adrese çevrilir', users.has(MAIL_I) && (await F.main()).includes(MAIL_I + ' adresine'), await F.main());
    check('ülke kodundan sonra sıfırla yazılan telefon kabul edilir', users.has(MAIL_I) && users.get(MAIL_I).profile.phone === '05321112233');
    await f.goto(BASE + '/sifremi-unuttum');
    await F.L('E-posta').fill('yıldız@example.com');
    await f.getByRole('button', { name: 'Link gönder' }).click();
    check('şifre yenileme isteğinde de Türkçe harf uyarısı', /Türkçe harf/.test(await F.alert()), await F.alert());
    await ctx20.close();
  });

  // 21. Sunucunun yanıtları
  await section('21', async () => {
    const home = await fetch(BASE + '/');
    const header = (name) => home.headers.get(name) || '';
    check(
      'güvenlik başlıkları her sayfayla gönderilir',
      header('x-frame-options') === 'DENY' && header('content-security-policy').includes("frame-ancestors 'none'") && header('x-content-type-options') === 'nosniff' && header('referrer-policy') === 'strict-origin-when-cross-origin',
      JSON.stringify(Object.fromEntries(home.headers)),
    );
    const account = await (await fetch(BASE + '/hesabim')).text();
    check('hesap sayfası arama motorlarına kapalı', /<meta name="robots" content="noindex"/.test(account));
    // Sayfalar sunucuda oturuma bakmaz; oturum çerezi olan istek de Supabase'i beklemeden yanıtlanır.
    const authCalls = () => requestLog.filter((l) => l.includes('/auth/v1/')).length;
    const before = authCalls();
    const tokens = tokensFor(MAIL_A);
    const stored = { ...tokens, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: users.get(MAIL_A).id, email: MAIL_A } };
    const cookie = 'sb-localhost-auth-token=base64-' + Buffer.from(JSON.stringify(stored)).toString('base64url');
    const withCookie = await fetch(BASE + '/programlar', { headers: { cookie } });
    check('oturum çerezi olan sayfa isteğinde sunucu Supabase\'e gitmez', withCookie.ok && authCalls() === before, String(authCalls() - before));
  });

  check('sahte sunucuya tanımadığı bir istek gitmedi', unexpectedRequests.length === 0, unexpectedRequests.join(' || '));
  check('tarayıcı hatası yok', errors.length === 0, errors.join(' || '));
  await b.close();
}

module.exports = checks;
if (require.main === module) main([checks]);
