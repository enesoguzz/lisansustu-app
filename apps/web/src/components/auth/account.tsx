"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@lisansustu/core";
import { useAuth } from "./auth-provider";
import { AuthCard, Field, FormError, FormInfo, SubmitButton } from "./ui";

type Profile = { full_name: string | null; phone: string | null; school: string | null };

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
      .select("full_name, phone, school")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError("Profilin yüklenemedi. Sayfayı yenilemeyi dene.");
        setProfile(data ?? { full_name: null, phone: null, school: null });
      });
  }, [user, loading, router]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setError("");
    setInfo("");
    const form = new FormData(e.currentTarget);
    const phone = normalizePhone(String(form.get("phone")));
    if (!phone) return setError("Telefon numaranı 05xx xxx xx xx biçiminde yaz.");
    setPending(true);
    const { error } = await createClient()
      .from("profiles")
      .update({
        full_name: String(form.get("full_name")).trim() || null,
        phone,
        school: String(form.get("school")).trim() || null,
      })
      .eq("id", user.id);
    setPending(false);
    if (error) setError("Kaydedilemedi. Lütfen tekrar dene.");
    else setInfo("Bilgilerin kaydedildi.");
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
    <AuthCard title="Hesabım" subtitle={user.email}>
      <form onSubmit={save} noValidate>
        <FormError message={error} />
        <FormInfo message={info} />
        <Field label="Ad Soyad" name="full_name" defaultValue={profile.full_name ?? ""} maxLength={120} />
        <Field label="Telefon" name="phone" type="tel" defaultValue={profile.phone ?? ""} placeholder="05xx xxx xx xx" />
        <Field label="Üniversite" name="school" defaultValue={profile.school ?? ""} maxLength={160} />
        <SubmitButton pending={pending}>Kaydet</SubmitButton>
      </form>
      <button onClick={signOut} className="btn btn-outline mt-4 w-full">
        Çıkış yap
      </button>
    </AuthCard>
  );
}
