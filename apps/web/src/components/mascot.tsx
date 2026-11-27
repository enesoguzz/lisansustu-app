"use client";

import { motion } from "motion/react";

/** Uygulamanın özgün maskotu: kep takan yuvarlak bir karakter. */
export function Mascot({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <ellipse cx="60" cy="112" rx="30" ry="5" fill="#0f1d4a" opacity=".12" />
      <circle cx="60" cy="66" r="38" fill="#1a2e6e" />
      <circle cx="60" cy="74" r="22" fill="#2b4494" />
      {/* gözler */}
      <g>
        <circle cx="46" cy="60" r="10" fill="#fff" />
        <circle cx="74" cy="60" r="10" fill="#fff" />
        <motion.g
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1] }}
          style={{ originY: "60px" }}
        >
          <circle cx="48" cy="61" r="5" fill="#0f1b3d" />
          <circle cx="76" cy="61" r="5" fill="#0f1b3d" />
          <circle cx="49.5" cy="59" r="1.6" fill="#fff" />
          <circle cx="77.5" cy="59" r="1.6" fill="#fff" />
        </motion.g>
      </g>
      <path d="M52 78q8 7 16 0" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* kep */}
      <path d="M22 30 60 14l38 16-38 16z" fill="#0f1d4a" />
      <path d="M38 37v10c0 4 10 8 22 8s22-4 22-8V37L60 46z" fill="#0f1d4a" />
      <motion.g
        animate={{ rotate: [0, 10, 0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{ originX: "96px", originY: "30px" }}
      >
        <path d="M96 30v18" stroke="#f5c84c" strokeWidth="3" strokeLinecap="round" />
        <circle cx="96" cy="50" r="4" fill="#f5c84c" />
      </motion.g>
    </motion.svg>
  );
}
