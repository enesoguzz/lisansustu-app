"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONNECTION_MESSAGE } from "@/lib/auth-errors";
import { normalizePhone } from "@lisansustu/core";
import { useAuth } from "./auth-provider";
import { AuthCard, Field, Form, FormError, FormInfo, SubmitButton } from "./ui";
import { KvkkConsent } from "./kvkk-consent";

type Profile = {
  full_name: string | null;
  phone: string | null;
  school: string | null;
  kvkk_accepted_at: string | null;
};

/** Profil isteğinin sonucu. "failed": istek başarısız oldu. "missing": hesabın profil satırı yok. */
type Loaded = { userId: string; result: Profile | "failed" | "missing" };

const COLUMNS = "full_name, phone, school, kvkk_accepted_at";

export function Account() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const leaving = useRef(false);

  // Profil, hesap değişmedikçe bir kez okunur: oturumun her yenilenişinde yeniden istenmez.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (loading || leaving.current) return;
    if (!userId) {
      router.replace("/giris");
      return;
    }
    let active = true;
    createClient()
      .from("profiles")
      .select(COLUMNS)
      .eq("id", userId)
      .maybeSingle<Profile>()
      .then(
        ({ data, error }) => ({ userId, result: error ? ("failed" as const) : (data ?? ("missing" as const)) }),
        () => ({ userId, result: "failed" as const }),
      )
      .then((next) => {
        // Yanıt geldiğinde hesap değişmiş ya da sayfadan çıkılmışsa yok sayılır.
        if (!active) return;
        setLoaded(next);
        // Önceki denemeden ya da önceki hesaptan kalan uyarı yeni yüklenen bilgilerin üstünde durmasın.
        setError("");
        setInfo("");
      });
    return () => {
      active = false;
    };
  }, [userId, loading, router, attempt]);

  // Başka bir hesabın profili ekranda kalmasın: yalnızca şu anki hesaba ait sonuç kullanılır.
  const result = loaded !== null && loaded.userId === userId ? loaded.result : null;
  const profile = typeof result === "object" ? result : null;
  // Google ile gelen üyenin telefonu ve aydınlatma metni onayı ilk girişte alınır.
  const incomplete = profile !== null && (!profile.phone || !profile.kvkk_accepted_at);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId || !profile) return;
    setError("");
    setInfo("");
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("full_name")).trim();
    const phone = normalizePhone(String(form.get("phone")));
    const consentNeeded = !profile.kvkk_accepted_at;
    if (!fullName) return setError("Adını ve soyadını yaz.");
    if (!phone) return setError("Telefon numaranı 05xx xxx xx xx biçiminde yaz.");
    if (consentNeeded && !form.get("consent")) {
      return setError("Devam etmek için aydınlatma metnini onaylaman gerekiyor.");
    }
    setPending(true);
    const { data, error } = await createClient()
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        school: String(form.get("school")).trim() || null,
        // Onayın zamanını veritabanı kendi saatiyle yazar; buradaki değer yalnızca "onaylandı" demektir.
        ...(consentNeeded ? { kvkk_accepted_at: new Date().toISOString() } : {}),
      })
      .eq("id", userId)
      .select(COLUMNS)
      .maybeSingle<Profile>();
    setPending(false);
    if (error || !data) return setError("Kaydedilemedi. Lütfen tekrar dene.");
    setLoaded({ userId, result: data });
    setInfo(incomplete ? "Hesabın hazır." : "Bilgilerin kaydedildi.");
  }

  async function signOut() {
    setError("");
    setInfo("");
    leaving.current = true;
    const supabase = createClient();
    // Yalnızca bu cihazdaki oturum kapanır. Bu tarayıcıdaki oturum, istek sunucuya ulaşmasa da silinir.
    const closed = await supabase.auth
      .signOut({ scope: "local" })
      .then(() => supabase.auth.getSession())
      .then(
        ({ data }) => data.session === null,
        () => false,
      );
    if (!closed) {
      leaving.current = false;
      return setError("Çıkış yapılamadı. Lütfen tekrar dene.");
    }
    // Bilerek tam sayfa yenileme: Next.js'in sakladığı önceki sayfa durumları da (formlar, üyeye ait bilgiler) temizlenir.
    // Geçmişte bu sayfanın yerini ana sayfa alır; "Geri" ile boş bir hesap sayfasına dönülmez.
    window.location.replace("/");
  }

  if (loading || !user || result === null) {
    return (
      <AuthCard title="Hesabım">
        <div className="h-64 animate-pulse rounded-3xl bg-navy-soft" aria-busy />
      </AuthCard>
    );
  }

  if (!profile) {
    return (
      <AuthCard title="Hesabım" subtitle={user.email}>
        <p role="alert" className="mb-6 rounded-3xl bg-navy-soft px-5 py-5 text-center font-semibold text-navy">
          {result === "failed"
            ? `Bilgilerin yüklenemedi. ${CONNECTION_MESSAGE}`
            : "Bu hesabın bilgileri bulunamadı. Bu, bizim tarafımızda düzeltilmesi gereken bir sorun."}
        </p>
        <FormError message={error} />
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            setLoaded(null);
            setAttempt((n) => n + 1);
          }}
        >
          Tekrar dene
        </button>
        <button onClick={signOut} className="btn btn-outline mt-4 w-full">
          Çıkış yap
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={incomplete ? "Son bir adım" : "Hesabım"}
      subtitle={
        incomplete ? (
          <>
            <strong className="font-extrabold wrap-anywhere text-navy">{user.email}</strong> hesabını tamamlamak için birkaç bilgi daha
            gerekiyor.
          </>
        ) : (
          user.email
        )
      }
    >
      {/* Hesap değişirse form sıfırdan kurulur: bir hesap için yazılanlar diğerine taşınmaz. */}
      <Form key={user.id} onSubmit={save}>
        <Field label="Ad Soyad" name="full_name" autoComplete="name" defaultValue={profile.full_name ?? ""} maxLength={120} required />
        <Field
          label="Telefon"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={profile.phone ?? ""}
          placeholder="05xx xxx xx xx"
          required
        />
        <Field
          label={incomplete ? "Okuduğun ya da mezun olduğun üniversite" : "Üniversite"}
          name="school"
          autoComplete="organization"
          defaultValue={profile.school ?? ""}
          maxLength={160}
          hint={incomplete ? "İstersen boş bırakabilirsin." : undefined}
        />
        {!profile.kvkk_accepted_at && <KvkkConsent />}
        <FormError message={error} />
        <FormInfo message={info} />
        <SubmitButton pending={pending}>{incomplete ? "Hesabımı tamamla" : "Kaydet"}</SubmitButton>
      </Form>
      <button onClick={signOut} className="btn btn-outline mt-4 w-full">
        Çıkış yap
      </button>
    </AuthCard>
  );
}
