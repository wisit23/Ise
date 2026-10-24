"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import {
  getAccessToken,
  getCurrentRoles,
  isCustomerAccountRoles,
} from "../lib/auth";

export default function WishlistButton({ productId, title, className = "" }) {
  const router = useRouter();
  const [state, setState] = useState({ saved: false, count: 0 });
  const [allowed, setAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let controller;
    function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setState({ saved: false, count: 0 });
      setError("");
      const token = getAccessToken();
      const customer = !token || isCustomerAccountRoles(getCurrentRoles());
      setAllowed(customer);
      if (!token || !customer) return;
      apiFetch(`/api/products/wishlist/${productId}`, { signal })
        .then((data) => {
          if (!signal.aborted) setState(data);
        })
        .catch((err) => {
          if (!signal.aborted) setError(err.message);
        });
    }
    const changed = (event) => {
      if (event.detail?.productId === productId) setState(event.detail.state);
    };
    load();
    window.addEventListener("reloop:auth", load);
    window.addEventListener("reloop:wishlist", changed);
    return () => {
      controller?.abort();
      window.removeEventListener("reloop:auth", load);
      window.removeEventListener("reloop:wishlist", changed);
    };
  }, [productId]);

  async function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!getAccessToken()) {
      router.push(
        `/login?next=${encodeURIComponent(`/products/${productId}`)}`,
      );
      return;
    }
    if (inFlight.current || !allowed) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(`/api/products/wishlist/${productId}`, {
        method: state.saved ? "DELETE" : "PUT",
      });
      setState(data);
      window.dispatchEvent(
        new CustomEvent("reloop:wishlist", {
          detail: { productId, state: data },
        }),
      );
    } catch (err) {
      setError(err.message || "บันทึกรายการโปรดไม่สำเร็จ");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!allowed) return null;
  return (
    <div className={`z-10 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={state.saved}
        aria-label={`${state.saved ? "นำออกจากรายการโปรด" : "บันทึกรายการโปรด"} ${title}`}
        className="focus-ring inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-line bg-surface px-3 text-sm text-brand-700 shadow-sm disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="material-symbols-outlined"
          style={{ fontVariationSettings: `'FILL' ${state.saved ? 1 : 0}` }}
        >
          favorite
        </span>
        <span>{state.count}</span>
      </button>
      {error && (
        <p
          role="alert"
          className="mt-1 max-w-52 rounded bg-surface p-2 text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
