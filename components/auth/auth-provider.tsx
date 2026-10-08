"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { setAuthenticatedApiCacheUser } from "@/lib/client-api-cache";

export type UserRole = "superadmin" | "employee";
export type AuthProfile = {
  user_id: string;
  role: UserRole;
  employee_id: number | null;
  full_name: string | null;
  is_active: boolean;
};

type AuthContextValue = {
  user: { id: string; email?: string } | null;
  profile: AuthProfile | null;
  loading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    setAuthenticatedApiCacheUser(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const currentUser = session?.user
          ? { id: session.user.id, email: session.user.email }
          : null;
        setUser(currentUser);
        if (!currentUser) {
          activeUserId.current = null;
          setProfile(null);
          setProfileError(null);
          setLoading(false);
        } else if (activeUserId.current !== currentUser.id) {
          activeUserId.current = currentUser.id;
          setProfile(null);
          setProfileError(null);
          setLoading(true);
        }
      },
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user?.id) return;
    const currentUserId = user.id;
    let mounted = true;

    async function loadProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, role, employee_id, full_name, is_active")
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (!mounted) return;
      setProfile(data as AuthProfile | null);
      setProfileError(
        error?.message ??
          (!data ? "Your account is not linked to a profile yet." : null),
      );
      setLoading(false);
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [supabase, user?.id]);

  async function signOut() {
    await supabase.auth.signOut({ scope: "global" });
    if (typeof window !== "undefined") {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("sb-")) window.localStorage.removeItem(key);
      }
      for (const key of Object.keys(window.sessionStorage)) {
        if (key.startsWith("sb-")) window.sessionStorage.removeItem(key);
      }
    }
    setUser(null);
    setProfile(null);
    setProfileError(null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, profileError, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
