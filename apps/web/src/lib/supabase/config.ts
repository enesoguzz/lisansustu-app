// Bu iki değer tarayıcıya gönderilen, herkese açık değerlerdir (gizli anahtar değildir).
// Veriyi koruyan şey veritabanındaki satır düzeyi güvenlik (RLS) kurallarıdır.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://vwhmdbajfbgvgmdnomsu.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_rgDXITDX61SCss2YP40CXQ_RMt3IIGM";
