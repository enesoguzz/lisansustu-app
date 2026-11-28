import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail, normalizePhone } from "./validation";

describe("normalizePhone", () => {
  it.each([
    ["0532 111 22 33", "05321112233"],
    ["05321112233", "05321112233"],
    ["5321112233", "05321112233"],
    ["+90 532 111 22 33", "05321112233"],
    ["90 (532) 111-22-33", "05321112233"],
    ["0090 532 111 22 33", "05321112233"],
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
  ])("geçersiz: %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("e-posta", () => {
  it("geçerli adresleri kabul eder", () => {
    expect(isValidEmail("ogrenci@universite.edu.tr")).toBe(true);
    expect(isValidEmail("  ad.soyad+etiket@gmail.com ")).toBe(true);
  });

  it("geçersiz adresleri reddeder", () => {
    for (const bad of ["", "ad", "ad@", "@alan.com", "ad@alan", "ad soyad@alan.com", "ad@alan.c"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it("küçük harfe çevirir ve boşlukları atar", () => {
    expect(normalizeEmail("  Ogrenci@Universite.EDU.TR ")).toBe("ogrenci@universite.edu.tr");
  });
});
