/** Web ve mobil formlarının ortak doğrulama kuralları. */

/** En kısa şifre uzunluğu (Supabase Auth ayarıyla aynı olmalı). */
export const MIN_PASSWORD = 8;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}

/**
 * Türkiye cep telefonu numarasını tek biçime getirir.
 * "0532 111 22 33", "+90 532 111 22 33", "5321112233" girdilerinin hepsi "05321112233" olur.
 * Geçerli bir cep numarası değilse null döner.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0090")) digits = digits.slice(4);
  else if (digits.startsWith("90") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^5\d{9}$/.test(digits) ? `0${digits}` : null;
}
