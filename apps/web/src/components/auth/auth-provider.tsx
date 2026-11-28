"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_CONFIGURED } from "@/lib/supabase/config";

type AuthState = {
  user: User | null;
  /** Oturum bilgisi henüz okunmadı. */
  loading: boolean;
  /** Üye yönetici mi? Yalnızca görünümü belirler; veriyi koruyan şey veritabanındaki erişim kurallarıdır. */
  isAdmin: boolean;
  /** Oturum ya da yöneticilik bilgisi henüz okunmadı. */
  roleLoading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, loading: true, isAdmin: false, roleLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: SUPABASE_CONFIGURED });
  const [role, setRole] = useState<{ userId: string; admin: boolean } | null>(null);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession({ user: next?.user ?? null, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Rol ayrı bir adımda okunur: oturum dinleyicisinin içinden veritabanı isteği yapılmaz (istemci kilitlenebilir).
  const userId = session.user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    createClient()
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: string }>()
      .then(({ data }) => {
        if (!cancelled) setRole({ userId, admin: data?.role === "admin" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthState>(() => {
    const roleKnown = userId === null || role?.userId === userId;
    return {
      user: session.user,
      loading: session.loading,
      isAdmin: userId !== null && role?.userId === userId && role.admin,
      roleLoading: session.loading || !roleKnown,
    };
  }, [session, role, userId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
