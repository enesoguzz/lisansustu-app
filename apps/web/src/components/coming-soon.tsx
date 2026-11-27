import Link from "next/link";
import { Mascot } from "./mascot";

export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <Mascot className="h-32 w-32" />
      <h1 className="mt-6 text-3xl font-black text-navy md:text-4xl">{title}</h1>
      <p className="mt-3 text-lg font-semibold text-navy-muted">{text}</p>
      <Link href="/" className="btn btn-primary mt-8">Ana sayfaya dön</Link>
    </section>
  );
}
