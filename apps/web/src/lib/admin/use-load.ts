"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { errorMessage } from "./data";

type Loaded<T> = { key: string; data?: T; error?: string };

/**
 * Sayfanın verisini yükler. `key` değişince (ör. başka bir kayıt açılınca) yeniden yükler;
 * `reload` aynı veriyi tazeler ve yenisi gelene kadar eskisini göstermeye devam eder.
 * `key` null ise hiçbir şey yüklemez.
 */
export function useLoad<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T> | null>(null);
  const [version, setVersion] = useState(0);
  const run = useEffectEvent(load);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setState({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ key, error: errorMessage(error, undefined, "Yüklenemedi. Sayfayı yenileyip tekrar dene.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  const current = state !== null && state.key === key ? state : null;
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: current?.data, error: current?.error ?? "", loading: key !== null && current === null, reload };
}
