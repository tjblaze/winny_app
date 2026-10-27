"use client";

import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { apiRequest } from "@/lib/api";

type EmailVerificationDialogProps = {
  email: string;
  open: boolean;
  onClose: () => void;
  onVerified: (message: string) => void;
};

export default function EmailVerificationDialog({
  email,
  open,
  onClose,
  onVerified
}: EmailVerificationDialogProps) {
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);

  if (!open) return null;

  function close() {
    setCode(["", "", "", "", "", ""]);
    setError("");
    setNotice("");
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { message } = await apiRequest<{ message: string }>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ code: code.join("") })
      });
      setCode(["", "", "", "", "", ""]);
      onVerified(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify your email.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { message } = await apiRequest<{ message: string }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setNotice(message);
      setCode(["", "", "", "", "", ""]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend the verification code.");
    } finally {
      setBusy(false);
    }
  }

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const nextCode = [...code];
    nextCode[index] = digit;
    setCode(nextCode);
    if (digit && index < 5) codeInputs.current[index + 1]?.focus();
  }

  function handleCodeKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      codeInputs.current[index - 1]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      codeInputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      codeInputs.current[index + 1]?.focus();
    }
  }

  function pasteCode(event: ClipboardEvent<HTMLDivElement>) {
    const pastedCode = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pastedCode) return;
    event.preventDefault();
    const digits = [...pastedCode];
    setCode(Array.from({ length: 6 }, (_, index) => digits[index] ?? ""));
    codeInputs.current[Math.max(0, Math.min(pastedCode.length, 6) - 1)]?.focus();
  }

  return (
    <div
      className="verification-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) close();
      }}
    >
      <section
        className="verification-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-title"
        aria-describedby="verification-description"
      >
        <div className="verification-dialog-art" aria-hidden="true">
          <span className="verification-art-spark verification-art-spark-one">✳</span>
          <span className="verification-art-spark verification-art-spark-two">✦</span>
          <span className="verification-art-stamp">@</span>
        </div>
        <button
          className="verification-close"
          type="button"
          aria-label="Close verification dialog"
          onClick={close}
          disabled={busy}
        >
          ×
        </button>
        <span className="verification-kicker"><span /> EMAIL CONFIRMATION <span /></span>
        <h2 id="verification-title">One quick <em>check.</em></h2>
        <p className="verification-description" id="verification-description">
          We sent a 6-digit code to<br /><strong>{email}</strong>
        </p>
        <form className="vendor-form verification-form" onSubmit={submit}>
          <div className="verification-digit-group" role="group" aria-label="6-digit email verification code" onPaste={pasteCode}>
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                className={`verification-digit${code[index] ? " is-filled" : ""}`}
                ref={(element) => { codeInputs.current[index] = element; }}
                required
                autoFocus={index === 0}
                type="tel"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                pattern="[0-9]"
                maxLength={1}
                placeholder="·"
                value={code[index]}
                style={{ color: "#315b40", WebkitTextFillColor: "#315b40", opacity: 1 }}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleCodeKeyDown(index, event)}
                aria-label={`Verification digit ${index + 1}`}
              />
            ))}
          </div>
          {error && <p className="vendor-alert account-error" role="alert">{error}</p>}
          {notice && <p className="vendor-storage-note" role="status">{notice}</p>}
          <button className="vendor-primary vendor-field-wide" type="submit" disabled={busy}>
            {busy ? "Checking your code..." : "Verify my email"} <span>→</span>
          </button>
        </form>
        <p className="verification-resend">
          <span className="verification-expiry">Your code is only valid for 10 minutes.</span>
          Didn&apos;t receive a code?{" "}
          <button type="button" onClick={() => void resend()} disabled={busy}>
            Resend code
          </button>
        </p>
      </section>
    </div>
  );
}
