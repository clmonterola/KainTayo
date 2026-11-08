"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import { hasErrors, validateLogin, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";

export function LoginForm({
  next,
  demoEmail,
  demoPassword,
  demoName,
}: {
  next: string;
  demoEmail: string;
  demoPassword: string;
  demoName: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState("");
  const [loading, setLoading] = useState(false);

  function focusFirstField(fields: FieldErrors) {
    const first = Object.keys(fields)[0];
    if (first) document.getElementById(first)?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner("");

    const localErrors = validateLogin(email, password);
    if (hasErrors(localErrors)) {
      setErrors(localErrors);
      focusFirstField(localErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      await api<{ user: { name: string; email: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      push({
        title: "Kain na!",
        description: "You're signed in. Let's get you fed.",
        variant: "success",
      });
      router.replace(next);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        // The auth endpoint's copy is rewritten here so the interface stays
        // provider-neutral without touching the API route itself.
        setBanner(
          error.status === 401
            ? "Incorrect email or password. Please try again."
            : error.message,
        );
        if (error.fields) {
          setErrors(error.fields);
          focusFirstField(error.fields);
        }
        push({ title: "Sign in failed", description: error.message, variant: "error" });
      } else {
        setBanner("Something went wrong. Please try again.");
      }
      setLoading(false);
    }
  }

  function fillDemo() {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setErrors({});
    setBanner("");
    document.getElementById("password")?.focus();
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <p className="text-[11px] font-bold tracking-[0.2em] text-brand uppercase">
          Welcome back
        </p>
        <h1 className="mt-2 text-4xl leading-[1.05] text-ink sm:text-[2.75rem]">
          Sign in and <span className="text-brand">kain na</span>.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your favorite Filipino comfort food is a few taps away.
        </p>
      </div>

      {banner ? (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
          </svg>
          <span>{banner}</span>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email address" htmlFor="email" error={errors.email} required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="you@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password} required>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={Boolean(errors.password)}
              className="pr-12"
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-muted transition hover:text-ink"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" />
                  <path d="M6.7 6.7C4.6 8.2 3 10.4 2.5 12c1 2.9 4.6 6 9.5 6 2 0 3.7-.6 5.1-1.5M14.2 6.3c-.7-.2-1.4-.3-2.2-.3 4.9 0 8.5 3.1 9.5 6-.3.9-.9 1.9-1.7 2.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M2.5 12c1-2.9 4.6-6 9.5-6s8.5 3.1 9.5 6c-1 2.9-4.6 6-9.5 6s-8.5-3.1-9.5-6Z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              )}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "Signing you in…" : "Sign in"}
          {!loading ? (
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </Button>
      </form>

      <div className="mt-6 rounded-3xl border border-dashed border-line bg-card/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase">
              Account details
            </p>
            <p className="mt-1.5 font-mono text-[13px] text-ink">{demoEmail}</p>
            <p className="font-mono text-[13px] text-ink">{demoPassword}</p>
            <p className="mt-1 text-[11px] text-muted">Signed in as {demoName}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={fillDemo}>
            Fill in
          </Button>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        By signing in you agree to the KainTayo terms of service and privacy
        policy.
      </p>
    </div>
  );
}
