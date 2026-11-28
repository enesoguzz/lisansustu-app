"use client";

import { MotionConfig } from "motion/react";

/** Cihazında "hareketi azalt" ayarı açık olanlarda kayan, sallanan animasyonlar oynatılmaz. */
export function MotionSettings({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
