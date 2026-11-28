/** Web ve mobil formlarının ortak doğrulama kuralları. */

/** En kısa şifre uzunluğu (Supabase Auth ayarıyla aynı olmalı). */
export const MIN_PASSWORD = 8;

/** Supabase Auth bir şifrenin en fazla bu kadar baytını kabul eder; Türkçe harfler iki bayt tutar. */
export const MAX_PASSWORD_BYTES = 72;

/** Şifre, sunucunun kabul ettiğinden uzun mu? */
export function isPasswordTooLong(password: string): boolean {
  let bytes = 0;
  for (const char of password) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes > MAX_PASSWORD_BYTES;
}

/**
 * Baştaki ve sondaki boşlukları atar, küçük harfe çevirir.
 * Türkçe klavyede büyük yazılan "İ", düz küçültmede "i" ile ayrı bir nokta işaretine dönüşür ve adres
 * görünüşte aynı kalıp başka bir adres olur; o işaret burada atılır.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase().replace(/\u0307/g, "");
}

const EMAIL_LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const EMAIL = new RegExp(`^[A-Za-z0-9.!#$%&'*+/=?^_\`{|}~-]+@(?:${EMAIL_LABEL}\\.)+[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$`);

/** Adres biçimi geçerli mi? Türkçe harf (ç, ğ, ı, ö, ş, ü) içeren adresler geçersiz sayılır. */
export function isValidEmail(input: string): boolean {
  const email = input.trim();
  return email.length <= 254 && EMAIL.test(email);
}

/** Adreste İngiliz alfabesi dışında bir harf var mı? (Kullanıcıya ayrı bir uyarı göstermek için.) */
export function hasNonAsciiLetter(input: string): boolean {
  return /[^\x00-\x7F]/.test(input.trim());
}

/**
 * Türkiye cep telefonu numarasını tek biçime getirir.
 * "0532 111 22 33", "+90 532 111 22 33", "5321112233" girdilerinin hepsi "05321112233" olur.
 * Geçerli bir cep numarası değilse null döner.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0090")) digits = digits.slice(4);
  // Ülke kodundan sonra sıfır yazılmışsa ("+90 0532...") o da kabul edilir.
  else if (digits.startsWith("90") && (digits.length === 12 || (digits.length === 13 && digits[2] === "0"))) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^5\d{9}$/.test(digits) ? `0${digits}` : null;
}
