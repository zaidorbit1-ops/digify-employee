"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconCheckCircle, IconMail } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") !== "inactive") return;

    setBlocked(true);
    params.delete("error");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  useEffect(() => {
    if (step !== "code" || resendCooldown === 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, resendCooldown > 0]);

  async function sendCode(isResend = false) {
    if (isResend && resendCooldown > 0) return;

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send a sign-in code.");
      if (result.status === "blocked") {
        setBlocked(true);
        setStep("email");
        setCode("");
        return;
      }

      setStep("code");
      setResendCooldown(60);
      setNotice(
        isResend
          ? "If an account exists for this email, a new sign-in code has been sent."
          : "If an account exists for this email, a sign-in code has been sent.",
      );
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send a sign-in code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (step === "email") {
      await sendCode();
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await getSupabaseBrowserClient().auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (verifyError) throw verifyError;
      router.replace("/dashboard");
      router.refresh();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Could not verify the sign-in code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-ambient relative min-h-screen overflow-hidden px-5 py-8 sm:px-10 lg:px-14 lg:py-12">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col">
        <Image src="/logo.png" alt="Digify IT Solution" width={270} height={70} className="h-16 w-auto object-contain object-left sm:h-20" />
        <div className="my-auto grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(420px,500px)] lg:gap-20">
          <section className="max-w-xl text-foreground">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Digify IT Solution</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl xl:text-6xl">Welcome to Digify IT Solution</h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-muted">A simple, secure place to sign in and continue your work.</p>
          </section>
          <section className="rounded-3xl bg-[#171211] px-6 py-8 text-white shadow-[0_30px_90px_rgba(28,20,18,0.24)] sm:px-10 sm:py-10 [&_label>span]:text-stone-300">
            <div className="mb-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffaaa4]">Welcome back</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">
                {step === "email" ? "Sign in to your workspace" : "Your code is on its way"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                {blocked
                  ? "This account can’t sign in right now."
                  : step === "email"
                  ? "Enter your work email. We’ll send you a one-time code to sign in."
                  : "Open the email and enter the code below to finish signing in."}
              </p>
            </div>

            {blocked ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-red-300/20 bg-red-300/[0.08] p-5" role="alert">
                  <p className="font-semibold text-red-100">You have been blocked by your administrator.</p>
                  <p className="mt-2 text-sm leading-6 text-stone-300">Please contact your administrator if you think this is a mistake.</p>
                </div>
                <Button
                  type="button"
                  className="w-full py-3"
                  onClick={() => {
                    setBlocked(false);
                    setEmail("");
                    setCode("");
                    setError(null);
                    setNotice(null);
                    setStep("email");
                  }}
                >
                  Try a different email
                </Button>
              </div>
            ) : (
              <>
                <ol aria-label="Sign-in steps" className="mb-7 grid grid-cols-2 gap-3">
                  <li className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${step === "email" ? "border-[#e45a5a]/50 bg-[#e45a5a]/10 text-white" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${step === "email" ? "bg-primary text-white" : "bg-emerald-400/20 text-emerald-200"}`}>
                      {step === "email" ? "1" : <IconCheckCircle className="h-4 w-4" />}
                    </span>
                    Enter email
                  </li>
                  <li className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${step === "code" ? "border-[#e45a5a]/50 bg-[#e45a5a]/10 text-white" : "border-white/10 bg-white/[0.03] text-stone-500"}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${step === "code" ? "bg-primary text-white" : "bg-white/10 text-stone-400"}`}>2</span>
                    Verify code
                  </li>
                </ol>

                {step === "code" ? (
                  <div className="mb-6 flex gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4" role="status" aria-live="polite">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200">
                      <IconMail className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-100">Check your inbox</p>
                      <p className="mt-1 break-all text-sm text-stone-200">{email.trim().toLowerCase()}</p>
                      <p className="mt-1.5 text-xs leading-5 text-stone-400">If an account exists for this email, a sign-in code has been sent. Check your spam/junk folder too.</p>
                    </div>
                  </div>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {step === "email" ? (
                    <Field label="Email address">
                      <TextInput required type="email" autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
                    </Field>
                  ) : (
                    <Field label="Email code">
                      <TextInput required type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter your one-time code" className="h-14 text-center text-xl font-semibold tracking-[0.35em] placeholder:text-sm placeholder:font-normal placeholder:tracking-normal" />
                    </Field>
                  )}
                  {error ? <Alert tone="danger">{error}</Alert> : null}
                  {notice ? <p className="text-sm text-emerald-200" role="status" aria-live="polite">{notice}</p> : null}
                  <Button type="submit" loading={loading} disabled={loading} className="w-full py-3">
                    {loading ? (step === "email" ? "Sending your code..." : "Checking your code...") : step === "email" ? "Email me a sign-in code" : "Verify code and sign in"}
                  </Button>
                  {step === "code" ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm">
                      <button type="button" disabled={loading} onClick={() => { setStep("email"); setCode(""); setError(null); setNotice(null); }} className="font-semibold text-stone-300 underline decoration-white/20 underline-offset-4 hover:text-white">Wrong email? Change it</button>
                      {resendCooldown > 0 ? (
                        <span className="text-stone-400" role="timer" aria-live="off">
                          Resend code in 00:{String(resendCooldown).padStart(2, "0")}
                        </span>
                      ) : (
                        <button type="button" disabled={loading} onClick={() => sendCode(true)} className="font-semibold text-[#ffaaa4] underline decoration-[#ffaaa4]/30 underline-offset-4 hover:text-white">Send a new code</button>
                      )}
                    </div>
                  ) : null}
                </form>
              </>
            )}
          </section>
        </div>
        <p className="relative mt-auto text-xs text-stone-500">Employee and operations management</p>
      </div>
    </main>
  );
}
