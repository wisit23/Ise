"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { apiFetch } from "../../lib/api";
import { resolvePostLoginPath, saveSession } from "../../lib/auth";
import { AuthIcon, PasswordInput } from "./AuthLayout";
import styles from "./AuthLayout.module.css";
import { authError } from "./authError";
import {
  PHONE_HINT,
  PHONE_MAX_LENGTH,
  PHONE_PATTERN,
  phoneDigits,
} from "../../lib/phone";

export function LoginPage({ onAuthenticated } = {}) {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("reason") === "suspended"
    ) {
      setError("This account has been suspended. Please contact support.");
    }
  }, []);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: form,
      });
      saveSession(data);
      const search = new URLSearchParams(window.location.search);
      const destination = resolvePostLoginPath({
        accessToken: data.accessToken,
        user: data.user,
        requestedDestination:
          search.get("next") ||
          search.get("returnTo") ||
          search.get("redirect"),
      });
      if (onAuthenticated) await onAuthenticated(destination);
      else router.push(destination);
    } catch (err) {
      setError(authError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={styles.form}
        aria-label="Sign in"
        aria-busy={loading}
      >
        <Input
          required
          type="email"
          name="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={update("email")}
        />
        <PasswordInput
          required
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={form.password}
          onChange={update("password")}
        />
        <Link href="/forgot-password" className={styles.forgotLink}>
          Forgot password?
        </Link>
        {error && <Alert>{error}</Alert>}
        <Button
          type="submit"
          size="lg"
          loading={loading}
          className={styles.submit}
        >
          <span>{loading ? "Signing in..." : "Sign in"}</span>
          {!loading && <AuthIcon name="arrow" />}
        </Button>
      </form>
    </>
  );
}

export function RegisterPage({ onAuthenticated } = {}) {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: { ...form, role: "BUYER" },
      });
      saveSession(data);
      if (onAuthenticated) await onAuthenticated("/");
      else router.push("/");
    } catch (err) {
      setError(authError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={styles.form}
        aria-label="Sign up"
        aria-busy={loading}
      >
        <div className={styles.nameRow}>
          <Input
            required
            name="firstName"
            label="First name"
            autoComplete="given-name"
            placeholder="Your first name"
            value={form.firstName}
            onChange={update("firstName")}
          />
          <Input
            required
            name="lastName"
            label="Last name"
            autoComplete="family-name"
            placeholder="Last name"
            value={form.lastName}
            onChange={update("lastName")}
          />
        </div>
        <Input
          required
          type="email"
          name="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={update("email")}
        />
        <Input
          type="tel"
          name="phone"
          label="Phone number"
          hint="Optional"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="08xxxxxxxx"
          maxLength={PHONE_MAX_LENGTH}
          pattern={PHONE_PATTERN}
          title={PHONE_HINT}
          value={form.phone}
          onChange={(e) =>
            setForm({ ...form, phone: phoneDigits(e.target.value) })
          }
        />
        <PasswordInput
          required
          name="password"
          label="Password"
          hint="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          placeholder="Create your password"
          value={form.password}
          onChange={update("password")}
        />
        {error && <Alert>{error}</Alert>}
        <Button
          type="submit"
          size="lg"
          loading={loading}
          className={styles.submit}
        >
          <span>{loading ? "Creating account..." : "Sign up"}</span>
          {!loading && <AuthIcon name="arrow" />}
        </Button>
      </form>
    </>
  );
}
