"use client";

import { useEffect, useRef, useState } from "react";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Input from "../ui/Input";
import {
  confirmEmail,
  isInvalidConfirmationError,
  resendConfirmation,
  takeConfirmationTokenFromUrl,
} from "../../lib/emailVerification";
import AuthLayout, { AuthIcon } from "./AuthLayout";
import styles from "./AuthLayout.module.css";
import { authError } from "./authError";
import EmailReference from "./EmailReference";

/**
 * Sends a fresh confirmation link to `email` and reports the outcome inline.
 * A parent that already shows a reference passes `onSent` to replace it with
 * the new one; otherwise the new reference is shown here.
 */
export function ResendConfirmationButton({ email, onSent }) {
  const [status, setStatus] = useState({
    tone: null,
    message: "",
    reference: "",
  });
  const [loading, setLoading] = useState(false);

  async function resend() {
    setLoading(true);
    try {
      const { message, reference } = await resendConfirmation(email);
      if (onSent) onSent(reference);
      setStatus({
        tone: "success",
        message,
        reference: onSent ? "" : reference,
      });
    } catch (err) {
      setStatus({ tone: "error", message: authError(err), reference: "" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.inlineAction}
        onClick={resend}
        disabled={loading || !email}
      >
        {loading ? "Sending..." : "Send me a new confirmation link"}
      </button>
      {status.message && (
        <Alert tone={status.tone}>
          {status.message}
          {status.reference && <EmailReference code={status.reference} />}
        </Alert>
      )}
    </>
  );
}

/** Shown after sign-up when the account still has to be confirmed. */
export function CheckYourEmail({ email, expiresInHours, reference }) {
  // Follows the newest email: a resend replaces the code shown here.
  const [latestReference, setLatestReference] = useState(reference);
  return (
    <div className={styles.form}>
      <Alert tone="success" title="Check your email">
        We sent a confirmation link to <strong>{email}</strong>. Open it to
        activate your account, then sign in.
        {expiresInHours ? ` The link expires in ${expiresInHours} hours.` : ""}
        {latestReference && <EmailReference code={latestReference} />}
      </Alert>
      <ResendConfirmationButton email={email} onSent={setLatestReference} />
    </div>
  );
}

function RequestNewLink() {
  const [email, setEmail] = useState("");
  return (
    <div className={styles.form}>
      <Alert title="This link can't be used">
        This confirmation link is invalid or has expired, or your email is
        already confirmed. Try signing in, or enter your email for a new link.
      </Alert>
      <Input
        type="email"
        name="email"
        label="Email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <ResendConfirmationButton email={email.trim()} />
    </div>
  );
}

function ConfirmEmail() {
  // "checking" → "done" | "invalid" | "error"
  const [stage, setStage] = useState("checking");
  const [error, setError] = useState("");
  // undefined = not read yet. The URL is cleared on first read, so a second
  // effect run (React StrictMode in development) must reuse the value.
  const token = useRef(undefined);

  function attempt() {
    setStage("checking");
    confirmEmail(token.current)
      .then(() => setStage("done"))
      .catch((err) => {
        if (isInvalidConfirmationError(err)) setStage("invalid");
        else {
          setError(authError(err));
          setStage("error");
        }
      });
  }

  useEffect(() => {
    if (token.current === undefined)
      token.current = takeConfirmationTokenFromUrl();
    if (token.current) attempt();
    else setStage("invalid");
  }, []);

  if (stage === "checking") {
    return (
      <p className={styles.form} role="status">
        Confirming your email...
      </p>
    );
  }
  if (stage === "invalid") return <RequestNewLink />;
  if (stage === "error") {
    return (
      <div className={styles.form}>
        <Alert>{error}</Alert>
        <Button
          type="button"
          size="lg"
          className={styles.submit}
          onClick={attempt}
        >
          <span>Try again</span>
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.form}>
      <Alert tone="success" title="Email confirmed">
        Your account is ready. Sign in to start shopping.
      </Alert>
      <Button href="/login" size="lg" className={styles.submit}>
        <span>Go to sign in</span>
        <AuthIcon name="arrow" />
      </Button>
    </div>
  );
}

export function VerifyEmailPage() {
  return (
    <AuthLayout
      mode="recovery"
      title="Confirm your email"
      subtitle="One last step before you can sign in."
    >
      <ConfirmEmail />
    </AuthLayout>
  );
}
