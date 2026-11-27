"use client";

import { useEffect, useRef, useState } from "react";
import { FormError, FormInfo } from "./ui";

/** Yeni link istemeden önce beklenen süre (Supabase aynı adrese dakikada bir e-posta gönderir). */
const RESEND_WAIT = 60;
/** Sayfaya her dönüşte sessizce yapılan "doğrulandı mı?" denemelerinin sınırı. */
const QUIET_CHECK_GAP_MS = 10_000;
const QUIET_CHECK_LIMIT = 6;

type Props = {
  /** Kullanıcıya ne gönderildiğini anlatan metin. */
  children: React.ReactNode;
  /** Linki yeniden gönderir; hata varsa mesajını döndürür. */
  onResend: () => Promise<string>;
  /**
   * Link başka bir cihazda ya da sekmede açıldıysa bu sayfadan devam etmeyi sağlar.
   * Devam edilemiyorsa nedenini döndürür. Verilmezse "devam et" düğmesi gösterilmez.
   */
  onContinue?: () => Promise<string>;
  /** Adım açılırken gösterilecek uyarı (örneğin yeni link gönderilemediyse). */
  initialError?: string;
};

/** "E-postanı kontrol et" adımı: linkin gönderildiğini söyler, yeniden gönderme ve devam etme sunar. */
export function CheckEmail({ children, onResend, onContinue, initialError = "" }: Props) {
  const [error, setError] = useState(initialError);
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(RESEND_WAIT);
  const [round, setRound] = useState(0);
  const quiet = useRef({ count: 0, last: 0, busy: false });

  // Bu adım uzun bir formun yerine açılır; sayfa aşağıda kalmasın, başlık ve açıklama görünsün.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Geri sayım saatten hesaplanır: sekme arka plandayken tarayıcı zamanlayıcıları yavaşlatsa da doğru kalır.
  useEffect(() => {
    const until = Date.now() + RESEND_WAIT * 1000;
    const update = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setWait(left);
      return left;
    };
    const timer = setInterval(() => {
      if (update() === 0) clearInterval(timer);
    }, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [round]);

  // Kullanıcı e-postasına bakıp bu sayfaya döndüğünde doğrulamayı kendiliğinden dene.
  useEffect(() => {
    if (!onContinue) return;
    const check = async () => {
      const q = quiet.current;
      if (document.visibilityState !== "visible" || q.busy) return;
      if (q.count >= QUIET_CHECK_LIMIT || Date.now() - q.last < QUIET_CHECK_GAP_MS) return;
      q.busy = true;
      q.count += 1;
      q.last = Date.now();
      try {
        await onContinue();
      } finally {
        q.busy = false;
      }
    };
    // Sekme değiştirilince "visibilitychange", ayrı bir pencereden dönülünce "focus" gelir.
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [onContinue]);

  async function resend() {
    setError("");
    setInfo("");
    setWait(RESEND_WAIT);
    setRound((r) => r + 1);
    const message = await onResend();
    if (message) setError(message);
    else setInfo("Yeni link gönderildi. Önceki link artık geçersiz.");
  }

  async function proceed() {
    if (!onContinue) return;
    setError("");
    setInfo("");
    setPending(true);
    quiet.current.last = Date.now();
    const message = await onContinue();
    if (message) {
      setError(message);
      setPending(false);
    }
  }

  return (
    <div>
      <div className="rounded-3xl bg-navy-soft px-5 py-5 text-center font-semibold text-navy">{children}</div>
      <p className="mb-6 mt-3 text-center text-sm font-semibold text-navy-muted">
        Gelmediyse spam klasörüne de bak.
      </p>
      <FormInfo message={info} />
      <FormError message={error} />
      {onContinue && (
        <button type="button" onClick={proceed} disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
          {pending ? "Bekle..." : "Doğruladım, devam et"}
        </button>
      )}
      <button
        type="button"
        onClick={resend}
        disabled={wait > 0}
        className={`${onContinue ? "mt-4" : ""} w-full text-center text-sm font-bold text-navy disabled:text-navy-muted`}
      >
        {wait > 0 ? `Yeni link için ${wait} sn bekle` : "Linki tekrar gönder"}
      </button>
    </div>
  );
}
