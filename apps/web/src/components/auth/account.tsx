"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

const COLUMNS = "full_name, phone, school, kvkk_accepted_at";

export function Account() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (loading || leaving.current) return;
    if (!user) {
      router.replace("/giris");
      return;
    }
    createClient()
      .from("profiles")
      .select(COLUMNS)
      .eq("id", user.id)
      .maybeSingle<Profile>()
      .then(({ data, error }) => {
        if (error) setError("Profilin yüklenemedi. Sayfayı yenilemeyi dene.");
        setProfile(data ?? { full_name: null, phone: null, school: null, kvkk_accepted_at: null });
      });
  }, [user, loading, router]);

  // Google ile gelen üyenin telefonu ve aydınlatma metni onayı ilk girişte alınır.
  const incomplete = profile !== null && (!profile.phone || !profile.kvkk_accepted_at);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !profile) return;
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
      .eq("id", user.id)
      .select(COLUMNS)
      .maybeSingle<Profile>();
    setPending(false);
    if (error || !data) return setError("Kaydedilemedi. Lütfen tekrar dene.");
    setProfile(data);
    setInfo(incomplete ? "Hesabın hazır." : "Bilgilerin kaydedildi.");
  }

  async function signOut() {
    setError("");
    setInfo("");
    leaving.current = true;
    const { error } = await createClient().auth.signOut();
    if (error) {
      leaving.current = false;
      return setError("Çıkış yapılamadı. İnternet bağlantını kontrol edip tekrar dene.");
    }
    // Bilerek tam sayfa yenileme: Next.js'in sakladığı önceki sayfa durumları da (formlar, üyeye ait bilgiler) temizlenir.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  if (loading || !user || !profile) {
    return (
      <AuthCard title="Hesabım">
        <div className="h-64 animate-pulse rounded-3xl bg-navy-soft" aria-busy />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={incomplete ? "Son bir adım" : "Hesabım"}
      subtitle={incomplete ? "Hesabını tamamlamak için birkaç bilgi daha gerekiyor." : user.email}
    >
      <Form onSubmit={save}>
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
