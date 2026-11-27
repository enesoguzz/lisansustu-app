"use client";

import { Fragment, useLayoutEffect, useState } from "react";

/**
 * Next.js, başka sayfaya geçildiğinde önceki sayfayı silmez; gizleyip durumunu saklar.
 * Üyelik sayfalarında bu istenmez: şifre, doğrulama kodu ve üyeye ait bilgiler
 * sayfadan çıkıldıktan sonra arka planda kalmamalı, geri dönüldüğünde de görünmemelidir.
 * Bu sarmalayıcı, sayfa her gizlendiğinde içeriğini sıfırdan kurar.
 */
export function Fresh({ children }: { children: React.ReactNode }) {
  const [visit, setVisit] = useState(0);
  useLayoutEffect(() => () => setVisit((v) => v + 1), []);
  return <Fragment key={visit}>{children}</Fragment>;
}
