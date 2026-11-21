"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithPhone } from "../phone-actions";
import { firebaseConfig, phoneError, toE164 } from "../lib/phone-login";

/**
 * "Continue with mobile number": Firebase texts a 6-digit code (an invisible reCAPTCHA first), she types it, and the
 * server signs her in from Firebase's ID token (../phone-actions.ts). Firebase loads only when she sends a code, and
 * keeps nothing in the browser (in-memory persistence): the Seatora session is the only sign-in.
 */
async function firebase() {
  const [{ getApps, initializeApp }, a] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  let auth;
  try {
    auth = a.initializeAuth(app, { persistence: a.inMemoryPersistence });
  } catch {
    auth = a.getAuth(app); // already set up (a second send)
  }
  auth.languageCode = "en";
  return { a, auth };
}

export function PhoneLogin({ next }: { next: string }) {
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const to = toE164(number);
    if (!to) return setError(phoneError("auth/invalid-phone-number"));
    setBusy(true);
    setError("");
    try {
      const { a, auth } = await firebase();
      verifier.current?.clear(); // a used reCAPTCHA can't vouch for a resend: a new one each time
      verifier.current = new a.RecaptchaVerifier(auth, "phone-recaptcha", { size: "invisible" });
      confirmation.current = await a.signInWithPhoneNumber(auth, to, verifier.current);
      setSentTo(to);
      setCode("");
    } catch (err) {
      setError(phoneError((err as { code?: string }).code));
      verifier.current?.clear();
      verifier.current = null;
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !confirmation.current) return;
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from the SMS.");
    setBusy(true);
    setError("");
    try {
      const cred = await confirmation.current.confirm(code);
      const r = await signInWithPhone(await cred.user.getIdToken());
      if (r.ok) return window.location.replace(next);
      setError(r.error);
    } catch (err) {
      setError(phoneError((err as { code?: string }).code));
    }
    setBusy(false);
  };

  const shown = sentTo.startsWith("+91") ? `+91 ${sentTo.slice(3, 8)} ${sentTo.slice(8)}` : sentTo;
  return (
    <div className="mt-6 grid gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {!sentTo ? (
        <form onSubmit={send} noValidate className="grid gap-2">
          <label htmlFor="phone-number" className="text-sm font-medium">Mobile number</label>
          <div className="flex gap-2">
            <span aria-hidden className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm text-muted-foreground">+91</span>
            <Input
              id="phone-number"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="h-11 flex-1"
              aria-describedby="phone-what"
            />
          </div>
          <Button type="submit" variant="secondary" size="lg" aria-disabled={busy || undefined} className="aria-disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Send OTP
          </Button>
          <p id="phone-what" className="text-xs leading-relaxed text-muted-foreground">
            We text you a 6-digit code. Your number is your account, no password needed (the same account as WhatsApp sign-in).
          </p>
        </form>
      ) : (
        <form onSubmit={confirm} noValidate className="grid gap-2">
          <label htmlFor="phone-code" className="text-sm font-medium">Code sent to <span className="numeric">{shown}</span></label>
          <Input
            id="phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="numeric h-11 tracking-widest"
            autoFocus
          />
          <Button type="submit" size="lg" aria-disabled={busy || undefined} className="aria-disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Verify and continue
          </Button>
          <p className="flex flex-wrap gap-x-4 text-sm">
            <button type="button" onClick={() => send()} className="inline-flex min-h-11 items-center text-sky underline">Resend code</button>
            <button type="button" onClick={() => { setSentTo(""); setError(""); }} className="inline-flex min-h-11 items-center text-sky underline">Change number</button>
          </p>
        </form>
      )}
      <div id="phone-recaptcha" />
      {error && <p role="alert" className="rounded-md border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>}
    </div>
  );
}
