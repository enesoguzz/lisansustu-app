// Bu iki değer tarayıcıya gönderilen, herkese açık değerlerdir (gizli anahtar değildir).
// Veriyi koruyan şey veritabanındaki satır düzeyi güvenlik (RLS) kurallarıdır.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://hraroibzfshhhjwjfiuh.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_rMuel41cvcVOwKiKddxcqg_5F_ICwHO";

/** Veritabanı bağlanmadıysa false. Üyelik formları bu durumda istek atmaz, bilgi mesajı gösterir. */
export const SUPABASE_CONFIGURED = SUPABASE_URL !== "" && SUPABASE_PUBLISHABLE_KEY !== "";

export const NOT_READY_MESSAGE =
  "Üyelik sistemi şu anda kurulum aşamasında. Lütfen biraz sonra tekrar dene.";
