import Link from "next/link";

/** KVKK Aydınlatma Metni onay kutusu. Kayıt formunda ve Google ile gelenlerin ilk girişinde kullanılır. */
export function KvkkConsent() {
  return (
    <label className="mb-5 flex items-start gap-3 text-sm font-semibold text-navy-muted">
      <input type="checkbox" name="consent" className="mt-1 h-4 w-4 accent-navy" />
      <span>
        <Link href="/kvkk" className="font-bold text-navy underline" target="_blank">
          KVKK Aydınlatma Metni
        </Link>
        &apos;ni okudum, bilgilerimin üyelik için işlenmesini kabul ediyorum.
      </span>
    </label>
  );
}
