"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { clearSession } from "../../lib/auth";
import {
  PASSWORD_MIN_LENGTH,
  isInvalidTokenError,
  passwordProblem,
  requestPasswordReset,
  resetPassword,
  takeResetTokenFromUrl,
  verifyResetToken,
} from "../../lib/passwordReset";
import AuthLayout, { AuthIcon, PasswordInput } from "./AuthLayout";
import styles from "./AuthLayout.module.css";
import { authError } from "./authError";

function SubmitButton({ loading, idleLabel, busyLabel }) {
  return (
    <Button type="submit" size="lg" loading={loading} className={styles.submit}>
      <span>{loading ? busyLabel : idleLabel}</span>
      {!loading && <AuthIcon name="arrow" />}
    </Button>
  );
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { message } = await requestPasswordReset(email.trim());
      setSentMessage(message);
    } catch (err) {
      setError(authError(err));
    } finally {
      setLoading(false);
    }
  }

  if (sentMessage) {
    return (
      <div className={styles.form}>
        <Alert tone="success" title="Check your email">
          {sentMessage}
        </Alert>
        <button
          type="button"
          className={styles.inlineAction}
          onClick={() => setSentMessage("")}
        >
          Didn&apos;t get it? Send another link
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.form}
      aria-label="Request a password reset link"
      aria-busy={loading}
    >
      <Input
        required
        type="email"
        name="email"
        label="Email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && <Alert>{error}</Alert>}
      <SubmitButton
        loading={loading}
        idleLabel="Send reset link"
        busyLabel="Sending..."
      />
    </form>
  );
}

const LINK_PROBLEM =
  "This reset link is invalid or has expired. Reset links work once and only for a limited time.";

function InvalidLink() {
  return (
    <div className={styles.form}>
      <Alert title="This link can't be used">{LINK_PROBLEM}</Alert>
      <Link href="/forgot-password" className={styles.inlineAction}>
        Request a new link
      </Link>
    </div>
  );
}

function ResetPasswordForm() {
  // "checking" → "ready" | "invalid"; "ready" → "done"
  const [stage, setStage] = useState("checking");
  // undefined = not read yet. The URL is cleared on first read, so a second
  // effect run (React StrictMode in development) must reuse the value.
  const token = useRef(undefined);
  const [form, setForm] = useState({ password: "", confirmation: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token.current === undefined) token.current = takeResetTokenFromUrl();
    if (!token.current) {
      setStage("invalid");
      return;
    }
    verifyResetToken(token.current)
      .then(() => setStage("ready"))
      .catch((err) => {
        if (isInvalidTokenError(err)) setStage("invalid");
        else {
          setStage("ready");
          setError(authError(err));
        }
      });
  }, []);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = passwordProblem(form.password, form.confirmation);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await resetPassword(token.current, form.password);
      // The server just signed every device out; drop this tab's stale
      // session too so the next page doesn't act on a revoked token.
      clearSession();
      setStage("done");
    } catch (err) {
      if (isInvalidTokenError(err)) setStage("invalid");
      else setError(authError(err));
    } finally {
      setLoading(false);
    }
  }

  if (stage === "checking") {
    return (
      <p className={styles.form} role="status">
        Checking your reset link...
      </p>
    );
  }
  if (stage === "invalid") return <InvalidLink />;
  if (stage === "done") {
    return (
      <div className={styles.form}>
        <Alert tone="success" title="Password updated">
          Your password has been changed and every device has been signed out.
          Sign in again with your new password.
        </Alert>
        <Button href="/login" size="lg" className={styles.submit}>
          <span>Go to sign in</span>
          <AuthIcon name="arrow" />
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.form}
      aria-label="Choose a new password"
      aria-busy={loading}
    >
      <PasswordInput
        required
        name="password"
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        placeholder="Create a new password"
        value={form.password}
        onChange={update("password")}
      />
      <PasswordInput
        required
        name="confirmation"
        label="Confirm new password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        placeholder="Type it again"
        value={form.confirmation}
        onChange={update("confirmation")}
      />
      {error && <Alert>{error}</Alert>}
      <SubmitButton
        loading={loading}
        idleLabel="Update password"
        busyLabel="Updating..."
      />
    </form>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthLayout
      mode="recovery"
      title="Forgot your password"
      subtitle="Enter your account email and we'll send you a link to choose a new one."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  return (
    <AuthLayout
      mode="recovery"
      title="Choose a new password"
      subtitle="Pick something you haven't used for this account before."
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}
