// Yönetim panelini uçtan uca dener: erişim, dosyadan içe aktarma, önizleme, taslak ve yayın,
// ilan düzenleme, üniversite / kural / program işlemleri. Sonuçlar hem ekrandan hem veritabanından doğrulanır;
// "ziyaretçi ne görür" soruları sitenin kullandığı adrese oturumsuz istek atılarak sorulur.
//
// Çalıştırma (apps/web içinde): pnpm e2e (bütün takımlar) ya da yalnızca bu takım için node e2e/yonetim.cjs
const fs = require('fs');
const path = require('path');
const { BASE, MOCK, WAIT, check, section, eventually, kit, openBrowser, main } = require('./harness.cjs');
const { addMember, sql } = require('./mock-supabase.cjs');

const stamp = Date.now();
const ADMIN = `yonetici-${stamp}@example.com`;
const MEMBER = `uye-${stamp}@example.com`;
const PW = 'yerel-deneme-1';
const FIXTURE = path.join(__dirname, 'fixtures', 'ornek-ilan.json');
// Depodaki gerçek veri dosyalarından biri: yalnızca genel kural taşır, dönem ilanı yoktur.
const RULES_FILE = path.join(__dirname, '..', '..', '..', 'data', 'imports', 'kadir-has-genel-kurallar.json');

/** Ziyaretçinin (oturumsuz) okuyabildiği satırlar. */
async function publicRows(resource) {
  const response = await fetch(`${MOCK}/rest/v1/${resource}`);
  return response.ok ? response.json() : [];
}
const one = async (text, params) => (await sql(text, params))[0];

async function checks() {
  const { browser, device, errors } = await openBrowser();
  const p = await (await device()).newPage();
  const K = kit(p);
  const { L } = K;
  /** Next.js önceki sayfaları gizli tuttuğundan yalnızca görünen öğelere bakılır. */
  const V = (locator) => locator.filter({ visible: true });
  const button = (name, exact = true) => V(p.getByRole('button', { name, exact }));
  const link = (name) => V(p.getByRole('link', { name, exact: true }));
  const rows = () => V(p.locator('main table tbody tr'));
  const panel = (name) => V(p.locator('main section').filter({ has: p.getByRole('heading', { name, level: 2 }) }));
  const mainText = async () => (await K.main()).replace(/\s+/g, ' ');
  const seen = async (text) => {
    await V(p.getByText(text)).first().waitFor(WAIT).catch(() => {});
    return V(p.getByText(text)).first().isVisible();
  };
  const openSection = async (name) => {
    const header = V(p.locator('main button[aria-expanded]').filter({ hasText: name })).first();
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  };
  const upload = async (file) => {
    await p.goto(BASE + '/yonetim/ice-aktar');
    await K.heading('Dosyadan içe aktar');
    await p.getByLabel('İçe aktarma dosyası').setInputFiles(file);
  };
  const confirm = async (label, yes) => {
    await button(label).first().click();
    await button(yes).click();
  };

  await addMember({ email: ADMIN, password: PW, name: 'Yönetici Deneme', admin: true });
  await addMember({ email: MEMBER, password: PW, name: 'Üye Deneme' });

  // 1. Yetkisi olmayanlar
  await section('yönetim 1', async () => {
    await K.signOut();
    await p.goto(BASE + '/yonetim');
    check('oturumsuz /yonetim girişe yönlenir', await K.arrives('/giris'), p.url());

    await K.login(MEMBER, PW);
    check('üye giriş yapar', await K.arrives('/hesabim'), p.url());
    check('üyenin menüsünde Yönetim yok', (await K.headerBtns()) === 'Hesabım', await K.headerBtns());
    for (const page of ['/yonetim', '/yonetim/ice-aktar', '/yonetim/universiteler']) {
      await p.goto(BASE + page);
      check(`üyeye ${page} kapalı`, await K.heading('Bu bölüm yöneticilere özel'));
    }
    await K.signOut();
  });

  // 2. Yönetici: boş panel ve hatalı dosyalar
  await section('yönetim 2', async () => {
    await K.login(ADMIN, PW);
    check('yönetici giriş yapar', await K.arrives('/hesabim'), p.url());
    check('yöneticinin menüsünde Yönetim var', (await K.headerBtns()) === 'Yönetim,Hesabım', await K.headerBtns());
    await V(p.locator('header').getByRole('link', { name: 'Yönetim' })).click();
    check('Yönetim sayfası açılır', await K.heading('Yönetim'));
    check('ilk açılışta ilan yok', await seen('Henüz ilan yok.'));

    // Kod yayında ama SQL dosyası henüz çalıştırılmamış: API "böyle bir tablo yok" der, panel ne yapılacağını söylemeli.
    const missing = { code: 'PGRST205', details: null, hint: null, message: "Could not find the table 'public.call_overview' in the schema cache" };
    await p.route('**/rest/v1/call_overview*', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(missing) }));
    await p.reload();
    await K.heading('Yönetim');
    check('tablolar kurulmamışsa panel bunu söyler', await seen(/tabloları bu veritabanında henüz kurulmamış.*0004_listings\.sql/), await mainText());
    await p.unroute('**/rest/v1/call_overview*');
    await p.route('**/rest/v1/call_overview*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'boom' }) }));
    await p.reload();
    await K.heading('Yönetim');
    check('yüklenemeyen sayfa "kaydedilemedi" demez', (await seen('Yüklenemedi. Sayfayı yenileyip tekrar dene.')) && !(await mainText()).includes('Kaydedilemedi'), await mainText());
    await p.unroute('**/rest/v1/call_overview*');

    await upload({ name: 'bozuk.json', mimeType: 'application/json', buffer: Buffer.from('{ "format": ') });
    check('bozuk dosya: okunamadı uyarısı', await seen(/Dosya okunamadı/));
    check('bozuk dosya: kaydetme düğmesi yok', (await button(/kaydet/i, false).count()) === 0);

    const broken = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    broken.listings[0].details.gpa.min4 = 31;
    broken.listings[1].degree = 'yuksek';
    await upload({ name: 'hatali.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken)) });
    check('hatalı dosya: hatalar ilanın adıyla listelenir', await seen(/Dosya kaydedilemez: düzeltilmesi gerekenler \(2\)/), await mainText());
    const text = await mainText();
    check('hatalı dosya: alan yolu okunur', text.includes("İlan 1 (Bilgisayar Mühendisliği, Tezli YL) › Şartlar ve ayrıntılar › Not ortalaması › Lisans alt sınırı (4'lük): En fazla 4 olabilir.") && text.includes('İlan 2 (Kimya Mühendisliği) › Derece'), text.slice(0, 600));
    check('hatalı dosya: kaydetme düğmesi yok', (await button(/kaydet/i, false).count()) === 0);
    check('hatalı dosyadan hiçbir şey yazılmaz', (await one('select count(*)::int as n from public.universities')).n === 0);
  });

  // 3. İçe aktarma: önizleme ve taslak kayıt
  let callId = '';
  await section('yönetim 3', async () => {
    await upload(FIXTURE);
    await K.heading('Dosyadan içe aktar');
    check('önizleme açılır', await seen('2. Önizleme'));
    const text = await mainText();
    check('önizleme: uyarılar', text.includes('Göz atılması gerekenler (2)') && text.includes('Yönetmelik en az 55 ALES ister; burada 50 yazıyor.'), text.slice(0, 500));
    check('önizleme: yeni üniversite ve yeni dönem ilanı', text.includes('Yeni üniversite') && text.includes('Yeni dönem ilanı'));
    check('önizleme: sayılar', text.includes('4 ilan, 3 tanesi öğrenci alıyor') && text.includes('4 yeni, 0 değişecek, 0 aynı') && text.includes('1 yeni, 0 değişecek, 0 aynı'), text.slice(300, 900));
    check('önizleme: şart özetleri', text.includes('30 + 1 hazırlık') && text.includes('SAY 70-75 (koşullu)') && text.includes('Bu dönem öğrenci alınmıyor'));
    check('önizleme veritabanına yazmaz', (await one('select count(*)::int as n from public.universities')).n === 0);

    await button('Taslak olarak kaydet').click();
    check('kayıt sonucu', await seen(/4 yeni ilan eklendi, 0 ilan güncellendi, 0 ilan aynı kaldı/), await mainText());
    const saved = await one(
      `select c.id, c.status, c.published_at, (select count(*)::int from public.listings l where l.call_id = c.id) as listings,
              (select count(*)::int from public.programs) as programs, (select count(*)::int from public.university_rules) as rules,
              (select count(*)::int from public.imports) as imports
         from public.calls c`,
    );
    check('veritabanı: taslak dönem ilanı ve 4 ilan', saved?.status === 'taslak' && saved.published_at === null && saved.listings === 4 && saved.programs === 4 && saved.rules === 1 && saved.imports === 1, JSON.stringify(saved));
    callId = saved?.id ?? '';
    const cmpe = await one(`select l.quota_total, l.ales_say_min::float8 as ales_say_min, l.gpa_min4::float8 as gpa, l.lang_required, l.language from public.listings l join public.programs p on p.id = l.program_id where p.slug = 'bilgisayar-muhendisligi'`);
    check('veritabanı: süzgeç sütunları', cmpe?.quota_total === 31 && cmpe.ales_say_min === 70 && cmpe.gpa === 2.5 && cmpe.lang_required === true && cmpe.language === 'en', JSON.stringify(cmpe));
    check('taslak ziyaretçiye görünmez', (await publicRows('calls?select=id')).length === 0 && (await publicRows('listings?select=id')).length === 0);
    check('üniversite ve programlar herkese açık', (await publicRows('universities?select=slug')).length === 1 && (await publicRows('programs?select=slug')).length === 4);

    await link('Dönem ilanını aç').click();
    check('dönem ilanı sayfası açılır', await K.heading('Boğaziçi · 2026-2027 Bahar'));
  });

  // 4. Dönem ilanı sayfası: liste, süzgeç, gizleme, dönem bilgileri
  await section('yönetim 4', async () => {
    await rows().first().waitFor(WAIT);
    const text = await mainText();
    check('dönem ilanı taslak görünür', text.includes('Taslak') && text.includes('14 Aralık 2026 10.00 - 21 Aralık 2026 17.00') && text.includes('Bilim sınavı: 25 Aralık 2026 - 29 Aralık 2026'), text.slice(0, 500));
    check('tabloda 4 ilan', (await rows().count()) === 4 && text.includes('4 / 4 ilan'));

    await button('Uyarısı olanlar').click();
    check('süzgeç: uyarısı olanlar', (await rows().count()) === 1 && (await rows().first().innerText()).includes('Fizik'));
    await button('Alım yok').click();
    check('süzgeç: alım yok', (await rows().count()) === 1 && (await rows().first().innerText()).includes('İşletme'));
    await button('Hepsi').click();
    await L('Program ara').fill('KIMYA');
    check('arama büyük küçük harfe bakmaz', (await rows().count()) === 1 && (await rows().first().innerText()).includes('Kimya Mühendisliği'));
    await L('Program ara').fill('');

    const physics = rows().filter({ hasText: 'Fizik' });
    await physics.getByRole('button', { name: 'Gizle' }).click();
    await physics.getByRole('button', { name: 'Göster' }).waitFor(WAIT);
    check('gizlenen ilan işaretlenir', (await physics.innerText()).includes('Gizli'));
    check('veritabanı: ilan gizli', (await one(`select count(*)::int as n from public.listings where hidden`)).n === 1);

    await panel('Dönem bilgileri').getByRole('button', { name: 'Düzenle' }).click();
    await L('Başlık').fill('  Bahar   2027 Başvuruları ');
    await L('Son başvuru').fill('2026-12-01T17:00');
    await button('Kaydet').click();
    check('ters tarih kaydedilmez', (await K.alert()).includes('Başvuru başlangıcından önce olamaz.'), await K.alert());
    await L('Son başvuru').fill('2026-12-22T17:30');
    await button('Kaydet').click();
    check('dönem bilgileri kaydedilir', await seen('Dönem bilgileri kaydedildi.'));
    const call = await one(`select title, application_end, status from public.calls`);
    check('veritabanı: başlık temizlenir, saat Türkiye saatiyle yazılır', call?.title === 'Bahar 2027 Başvuruları' && new Date(call.application_end).toISOString() === '2026-12-22T14:30:00.000Z' && call.status === 'taslak', JSON.stringify(call));
  });

  // 5. İlan düzenleme
  await section('yönetim 5', async () => {
    await rows().filter({ hasText: 'Bilgisayar Mühendisliği' }).getByRole('link', { name: 'Düzenle' }).click();
    check('ilan sayfası açılır', await K.heading('Bilgisayar Mühendisliği'));
    check('bölüm özetleri', (await mainText()).includes('BUEPT C / TOEFL iBT 4,5 / IELTS 6,5 / CAE C'));

    await openSection('Kontenjan');
    await L('Asıl kontenjan').fill('otuz');
    check('geçersiz sayı yazarken işaretlenir', (await K.alert()).includes('Sayı olmalı.'), await K.alert());
    await button('Kaydet').click();
    check('geçersiz sayıyla kaydedilmez', (await K.status()).includes('Kırmızıyla işaretli alanları düzelt.'), await K.status());
    check('veritabanı: kontenjan değişmedi', (await one(`select quota_total from public.listings where quota_total = 31`)) !== undefined);

    await L('Asıl kontenjan').fill('32');
    check('kaydedilmemiş değişiklik uyarısı', await eventually(async () => (await K.status()).includes('Kaydedilmemiş değişiklikler var.')), await K.status());
    await openSection('ALES');
    await L(/^Alt sınır/).first().fill('40');
    check('yönetmelik altı ALES uyarısı', await seen('Yönetmelik en az 55 ALES ister; burada 40 yazıyor.'));
    await L(/^Alt sınır/).first().fill('72,5');
    await button('Kaydet').click();
    check('ilan kaydedilir', await eventually(async () => (await K.status()).includes('Kaydedildi.')), await K.status());
    const saved = await one(
      `select l.quota_total, l.ales_say_min::float8 as ales, l.details->'quota'->>'main' as main, l.details->'quota'->>'source' as source
         from public.listings l join public.programs p on p.id = l.program_id where p.slug = 'bilgisayar-muhendisligi'`,
    );
    check('veritabanı: şartlar ve süzgeç sütunları birlikte güncellenir', saved?.quota_total === 33 && saved.ales === 72.5 && saved.main === '32' && saved.source === '30 (Esas sınıf) + 1 (Dil hazırlık sınıfı)', JSON.stringify(saved));

    await button('Bu dönem alım yok').click();
    await p.getByRole('checkbox').check();
    await button('Kaydet').click();
    await eventually(async () => (await K.status()).includes('Kaydedildi.'));
    const off = await one(`select l.accepting, l.hidden from public.listings l join public.programs p on p.id = l.program_id where p.slug = 'bilgisayar-muhendisligi'`);
    check('veritabanı: alım yok ve gizli', off?.accepting === false && off.hidden === true, JSON.stringify(off));
    await button('Bu dönem öğrenci alıyor').click();
    await p.getByRole('checkbox').uncheck();
    await button('Kaydet').click();
    await eventually(async () => (await K.status()).includes('Kaydedildi.'));

    await link('Listeye dön').click();
    check('listeye dönülür', await K.heading('Boğaziçi · 2026-2027 Bahar'));
    await rows().first().waitFor(WAIT);
    check('tabloda yeni değerler', (await rows().filter({ hasText: 'Bilgisayar Mühendisliği' }).innerText()).replace(/\s+/g, ' ').includes('32 + 1 hazırlık SAY 72,5'), await rows().first().innerText());
  });

  // 6. Yayına alma, yayındayken içe aktarma, yayından kaldırma
  await section('yönetim 6', async () => {
    await button('Yayına al').click();
    check('yayın sorusu ilan sayısını söyler', await seen(/3 ilan herkese açık olacak/), await mainText());
    await button('Evet, yayına al').click();
    check('yayına alınır', await seen('Yayına alındı.'));
    const live = await one(`select status, published_at from public.calls`);
    check('veritabanı: yayında', live?.status === 'yayinda' && live.published_at !== null, JSON.stringify(live));
    const visible = await publicRows('listings?select=id,hidden');
    check('ziyaretçi yayındaki ilanları görür, gizleneni görmez', (await publicRows('calls?select=id')).length === 1 && visible.length === 3 && visible.every((l) => l.hidden === false), JSON.stringify(visible));
    check('ziyaretçi özet görünümü okur', (await publicRows('call_overview?select=listing_count,open_count'))[0]?.listing_count === 3);
    check('içe aktarma kayıtları ziyaretçiye kapalı', (await publicRows('imports?select=id')).length === 0);

    await upload(FIXTURE);
    check('yayındayken önizleme', await seen('2. Önizleme'));
    const text = await mainText();
    check('yayındaki ilan için uyarı ve değişecekler', text.includes('Yayında') && text.includes('0 yeni, 1 değişecek, 3 aynı') && text.includes('Değişecek') && text.includes('Dönem ilanında değişecekler'), text.slice(300, 1300));
    check('düğme yayındakini güncelleyeceğini söyler', await button('Kaydet ve yayındakini güncelle').isVisible());
    await button('Kaydet ve yayındakini güncelle').click();
    check('güncelleme sonucu', await seen(/0 yeni ilan eklendi, 1 ilan güncellendi, 3 ilan aynı kaldı/), await mainText());
    const after = await one(
      `select c.status, c.title, (select count(*)::int from public.listings where hidden) as hidden,
              (select l.quota_total from public.listings l join public.programs p on p.id = l.program_id where p.slug = 'bilgisayar-muhendisligi') as quota
         from public.calls c`,
    );
    check('dosya elle yapılan değişikliğin üzerine yazar; yayın ve gizleme korunur', after?.status === 'yayinda' && after.hidden === 1 && after.quota === 31 && after.title === '2026-2027 Bahar Lisansüstü Başvuruları', JSON.stringify(after));

    await upload(FIXTURE);
    await seen('2. Önizleme');
    check('aynı dosya ikinci kez: değişiklik yok', (await button('Değişiklik yok').isDisabled()) && (await mainText()).includes('Bu dosyadaki her şey zaten kayıtlı.'));

    await p.goto(BASE + '/yonetim');
    check('panelde yayındaki dönem ilanı', (await seen('Boğaziçi · 2026-2027 Bahar')) && (await mainText()).includes('Yayında'));
    await V(p.locator('main a[href^="/yonetim/donem?id="]')).first().click();
    await K.heading('Boğaziçi · 2026-2027 Bahar');
    await confirm('Yayından kaldır', 'Evet, kaldır');
    check('yayından kaldırılır', await seen('Yayından kaldırıldı.'));
    check('yayından kalkan ilan ziyaretçiye kapanır', (await publicRows('calls?select=id')).length === 0 && (await publicRows('listings?select=id')).length === 0);
  });

  // 7. Yalnızca genel kural taşıyan dosya: taslak durumu yoktur, kaydedilince herkese görünür
  await section('yönetim 7', async () => {
    await upload(RULES_FILE);
    check('genel kural dosyası: önizleme', await seen('2. Önizleme'));
    const text = await mainText();
    check('genel kural dosyası: başlık ve sayılar', text.includes('Kadir Has Üniversitesi · Genel kurallar') && text.includes('Yeni üniversite') && text.includes('4 yeni, 0 değişecek, 0 aynı'), text.slice(300, 900));
    check(
      'genel kural dosyasında taslak sözü verilmez',
      (await button('Kaydet').isVisible()) && text.includes('Genel kurallar kaydedildiği anda geçerli olur.') && !text.includes('taslak olarak durur'),
      text.slice(300, 900),
    );
    await button('Kaydet').click();
    check('genel kural dosyası: sonuç ilan saymaz', (await seen(/4 genel kural yazıldı/)) && !(await mainText()).includes('yeni ilan eklendi'), await mainText());
    await link('Üniversiteyi aç').click();
    check('kural dosyasının üniversitesi açılır', await K.heading('Kadir Has Üniversitesi'));
    await seen(/Tezsiz Yüksek Lisans/);
    const page = await mainText();
    check(
      'kural satırları ALES, not ortalaması ve yabancı dili özetler',
      page.includes('ALES: En az 55 · Yabancı dil: YDS / e-YDS 65') && page.includes('ALES: En az 80 · Not ortalaması: 3,00 · Yabancı dil: YDS / e-YDS 65') && page.includes('ALES: İstenmiyor'),
      page.slice(0, 1200),
    );
    check('ziyaretçi genel kuralları okur', (await publicRows('university_rules?select=id')).length === 5);

    await upload(RULES_FILE);
    await seen('2. Önizleme');
    check('kural dosyası ikinci kez: değişiklik yok', (await button('Değişiklik yok').isDisabled()) && (await mainText()).includes('0 yeni, 0 değişecek, 4 aynı'), await mainText());
  });

  // 8. Üniversite, genel kural, program, elle dönem ilanı
  await section('yönetim 8', async () => {
    await p.goto(BASE + '/yonetim/universiteler');
    check('üniversite listesi', (await K.heading('Üniversiteler')) && (await seen('Boğaziçi Üniversitesi')));
    await button('Üniversite ekle').click();
    await button('Ekle').click();
    check('boş üniversite formu kaydedilmez', (await K.alert()).includes('Bu alan zorunlu.'), await K.alert());
    await L(/^Adı/).fill('  İstanbul   Teknik Üniversitesi ');
    await L('Kısa adı').fill('İTÜ');
    await L('Web sitesi').fill('itu.edu.tr');
    await button('Ekle').click();
    check('adres http ile başlamalı', (await K.alert()).includes('http:// ya da https:// ile başlamalı'), await K.alert());
    await L('Web sitesi').fill('https://www.itu.edu.tr');
    await button('Ekle').click();
    check('üniversite eklenir', await K.heading('İstanbul Teknik Üniversitesi'));
    const itu = await one(`select id, slug, name, short_name from public.universities where slug = 'istanbul-teknik-universitesi'`);
    check('veritabanı: adres adı addan üretilir', itu?.name === 'İstanbul Teknik Üniversitesi' && itu.short_name === 'İTÜ', JSON.stringify(itu));

    await button('Kural ekle').click();
    await L(/^Derece/).selectOption('doktora');
    await openSection('ALES');
    await button('Evet').first().click();
    await button('+ Seçenek ekle').click();
    await L(/^Puan türü/).selectOption('SAY');
    await L(/^Alt sınır/).first().fill('55');
    await button('Kuralı kaydet').click();
    check('genel kural eklenir', await seen('ALES: SAY 55'));
    const rule = await one(`select degree, institute, details->'ales'->'options'->0->>'min' as min from public.university_rules where university_id = $1`, [itu?.id]);
    check('veritabanı: genel kural', rule?.degree === 'doktora' && rule.institute === '' && rule.min === '55', JSON.stringify(rule));

    await button('Program ekle').click();
    await L(/^Program adı/).fill('Mimarlık');
    await button('Ekle').click();
    check('program eklenir', await seen('Programlar (1)'));
    const architecture = panel(/^Programlar/).locator('li').filter({ hasText: 'Mimarlık' });
    await architecture.getByRole('button', { name: 'Sil' }).click();
    await architecture.getByRole('button', { name: 'Evet, sil' }).click();
    check('ilanı olmayan program silinir', await seen('Programlar (0)'));

    await link('Yeni dönem ilanı').click();
    check('yeni dönem ilanı formu', await K.heading('Yeni dönem ilanı'));
    await button('Taslak olarak oluştur').click();
    check('dönem seçilmeden oluşturulmaz', (await K.alert()).includes('Bu alan zorunlu.'), await K.alert());
    await L(/^Dönem/).selectOption('guz');
    await L(/^Akademik yılın başlangıcı/).fill('2027');
    await button('Taslak olarak oluştur').click();
    check('dönem ilanı oluşturulur', await K.heading('İTÜ · 2027-2028 Güz'));
    check('ilanı olmayan dönem yayına alınamaz', await button('Yayına al').isDisabled());

    await button('İlan ekle').click();
    await L('Yeni programın adı').fill('Uçak ve Uzay Mühendisliği');
    await L(/^Derece/).selectOption('yl-tezli');
    await button('Ekle ve şartlarını yaz').click();
    check('yeni programla ilan eklenir', await K.heading('Uçak ve Uzay Mühendisliği'));
    check('boş ilanda eksikler uyarılır', (await seen('Kontenjan yazılmamış.')) && (await mainText()).includes('Göz atılması gerekenler (3)'));
    const created = await one(`select l.degree, l.mode, l.language, l.accepting, p.slug from public.listings l join public.programs p on p.id = l.program_id where l.university_id = $1`, [itu?.id]);
    check('veritabanı: yeni ilan ve programı', created?.slug === 'ucak-ve-uzay-muhendisligi' && created.degree === 'yl-tezli' && created.mode === 'orgun' && created.language === 'tr' && created.accepting === true, JSON.stringify(created));

    await p.goto(`${BASE}/yonetim/universite?id=${itu?.id}`);
    await K.heading('İstanbul Teknik Üniversitesi');
    const aero = panel(/^Programlar/).locator('li').filter({ hasText: 'Uçak ve Uzay Mühendisliği' });
    await aero.getByRole('button', { name: 'Sil' }).click();
    await aero.getByRole('button', { name: 'Evet, sil' }).click();
    check('ilanı olan program silinemez', (await K.alert()).includes('silinemedi: bu programın ilanları var'), await K.alert());
    await confirm('Üniversiteyi sil', 'Evet, sil');
    check('bağlı kaydı olan üniversite silinemez', await eventually(async () => (await K.alert()).includes('Silinemedi: bu üniversitenin programları ya da dönem ilanları var')), await K.alert());

    await V(p.locator('main a[href^="/yonetim/donem?id="]')).first().click();
    await K.heading('İTÜ · 2027-2028 Güz');
    await button('Sil').first().click();
    check('silme sorusu ilan sayısını söyler', await seen(/içindeki 1 ilan silinecek; geri alınamaz/));
    await button('Evet, sil').click();
    check('dönem ilanı silinince panele dönülür', await K.arrives('/yonetim'), p.url());
    const left = await one(`select (select count(*)::int from public.calls where university_id = $1) as calls, (select count(*)::int from public.listings where university_id = $1) as listings`, [itu?.id]);
    check('veritabanı: dönem ilanı ilanlarıyla birlikte silinir', left?.calls === 0 && left.listings === 0, JSON.stringify(left));
  });

  // 9. Telefon ekranı ve bulunamayan kayıtlar
  await section('yönetim 9', async () => {
    await p.setViewportSize({ width: 390, height: 800 });
    await p.goto(`${BASE}/yonetim/donem?id=${callId}`);
    await K.heading('Boğaziçi · 2026-2027 Bahar');
    await rows().first().waitFor(WAIT);
    check('telefonda sayfa yana taşmaz', (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(`${BASE}/yonetim/ilan?id=00000000-0000-4000-8000-000000000000`);
    check('olmayan ilan', await K.heading('İlan bulunamadı'));
    await p.goto(`${BASE}/yonetim/donem?id=00000000-0000-4000-8000-000000000000`);
    check('olmayan dönem ilanı', await K.heading('Dönem ilanı bulunamadı'));
    await K.signOut();
    await p.goto(`${BASE}/yonetim/donem?id=${callId}`);
    check('çıkış yapınca yönetim sayfası girişe yönlenir', await K.arrives('/giris'), p.url());
  });

  check('yönetim: tarayıcı hatası yok', errors.length === 0, errors.join(' || '));
  await browser.close();
}

module.exports = checks;
if (require.main === module) main([checks]);
