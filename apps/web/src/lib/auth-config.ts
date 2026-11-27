/** E-posta doğrulama kodunun hane sayısı (Supabase Auth ayarıyla aynı olmalı). */
export const OTP_LENGTH = 6;
export const MIN_PASSWORD = 8;

/** 05xx xxx xx xx ya da +90 5xx... biçimlerini kabul eder, 05xxxxxxxxx olarak döndürür. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "").replace(/^90/, "").replace(/^0/, "");
  return /^5\d{9}$/.test(digits) ? `0${digits}` : null;
}
