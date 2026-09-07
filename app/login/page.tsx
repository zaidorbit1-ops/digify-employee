"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-ambient relative min-h-screen overflow-hidden px-5 py-8 sm:px-10 lg:px-14 lg:py-12">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-between">
        <Image src="/logo.png" alt="Digify IT Solution" width={270} height={70} className="h-16 w-auto object-contain object-left sm:h-20" />
        <div className="grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(420px,500px)] lg:gap-20">
          <section className="max-w-xl text-foreground">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Digify IT Solution</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl xl:text-6xl">Welcome to Digify IT Solution</h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-muted">A simple, secure place to sign in and continue your work.</p>
          </section>
          <section className="rounded-3xl bg-[#171211] px-6 py-8 text-white shadow-[0_30px_90px_rgba(28,20,18,0.24)] sm:px-10 sm:py-10 [&_label>span]:text-stone-300">
            <div className="mb-8"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffaaa4]">Welcome back</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Sign in to your workspace</h2><p className="mt-3 text-sm leading-6 text-stone-300">Use the account created for you by your administrator.</p></div>
            <form onSubmit={handleSubmit} className="space-y-5"><Field label="Email address"><TextInput required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></Field><Field label="Password"><div className="relative"><TextInput required type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="pr-16" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-500 hover:text-primary" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div></Field>{error ? <Alert tone="danger">{error}</Alert> : null}<Button type="submit" disabled={loading} className="w-full py-3">{loading ? "Signing in..." : "Sign in"}</Button></form>
          </section>
        </div>
        <p className="relative text-xs text-stone-500">Employee and operations management</p>
      </div>
    </main>
  );
}
