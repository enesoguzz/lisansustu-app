import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD, hasNonAsciiLetter, isPasswordTooLong, isValidEmail, normalizeEmail, normalizePhone } from "./validation";

describe("normalizePhone", () => {
  it.each([
    ["0532 111 22 33", "05321112233"],
    ["05321112233", "05321112233"],
    ["5321112233", "05321112233"],
    ["+90 532 111 22 33", "05321112233"],
    ["90 (532) 111-22-33", "05321112233"],
    ["0090 532 111 22 33", "05321112233"],
    // Ülke kodundan sonra sıfır yazılmış
    ["+90 0532 111 22 33", "05321112233"],
    ["+90 (0) 532 111 22 33", "05321112233"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    [""],
    ["0212 359 45 23"], // sabit hat
    ["0532 111 22"], // eksik
    ["0532 111 22 333"], // fazla
    ["abc"],
    // 90 ile başlayan ama ülke kodu olmayan, eksik haneli numara ülke kodu sanılmamalı
    ["9053211122"],
    // 13 haneli ama ülke kodundan sonrası sıfırla başlamıyor
    ["9053211122334"],
  ])("geçersiz: %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("e-posta", () => {
  it("geçerli adresleri kabul eder", () => {
    for (const good of ["ogrenci@universite.edu.tr", "  ad.soyad+etiket@gmail.com ", "a_b-c@alt-alan.example.co", "12345@std.yildiz.edu.tr"]) {
      expect(isValidEmail(good), good).toBe(true);
    }
  });

  it("geçersiz adresleri reddeder", () => {
    for (const bad of ["", "ad", "ad@", "@alan.com", "ad@alan", "ad soyad@alan.com", "ad@alan.c", "ad@alan..com", "ad@alan.com.", "ad@.com", "ad@-alan.com", "ad@@alan.com", "ad@alan,com"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
    expect(isValidEmail(`${"a".repeat(250)}@alan.com`)).toBe(false);
  });

  it("Türkçe harf içeren adresi geçersiz sayar ve bunu ayırt eder", () => {
    for (const turkish of ["yıldız@gmail.com", "şule@gmail.com", "ad@üniversite.edu.tr"]) {
      expect(isValidEmail(turkish), turkish).toBe(false);
      expect(hasNonAsciiLetter(turkish), turkish).toBe(true);
    }
    expect(hasNonAsciiLetter("ad@alan")).toBe(false);
  });

  it("küçük harfe çevirir ve boşlukları atar", () => {
    expect(normalizeEmail("  Ogrenci@Universite.EDU.TR ")).toBe("ogrenci@universite.edu.tr");
  });

  it("büyük İ ve I harflerini i yapar", () => {
    // Türkçe klavyede Caps Lock açıkken yazılan adres
    expect(normalizeEmail("ALİ.ILIK@GMAİL.COM")).toBe("ali.ilik@gmail.com");
    expect(isValidEmail(normalizeEmail("İLTERİŞ@GMAİL.COM"))).toBe(false); // ş kalır: ayrı uyarı gösterilir
    expect(normalizeEmail("İBRAHİM@GMAIL.COM")).toBe("ibrahim@gmail.com");
    // Harf ve nokta ayrı ayrı gelmişse de (I + birleşen nokta)
    expect(normalizeEmail("I\u0307brahim@gmail.com")).toBe("ibrahim@gmail.com");
  });
});

describe("şifre uzunluğu", () => {
  it("alt ve üst sınır", () => {
    expect(MIN_PASSWORD).toBe(8);
    expect(MAX_PASSWORD_BYTES).toBe(72);
  });

  it("72 bayta kadar kabul eder", () => {
    expect(isPasswordTooLong("")).toBe(false);
    expect(isPasswordTooLong("a".repeat(72))).toBe(false);
    expect(isPasswordTooLong("a".repeat(73))).toBe(true);
  });

  it("Türkçe harfleri iki bayt sayar", () => {
    expect(isPasswordTooLong("ş".repeat(36))).toBe(false);
    expect(isPasswordTooLong("ş".repeat(37))).toBe(true);
    // Emoji dört bayt
    expect(isPasswordTooLong("🙂".repeat(18))).toBe(false);
    expect(isPasswordTooLong("🙂".repeat(19))).toBe(true);
  });
});
