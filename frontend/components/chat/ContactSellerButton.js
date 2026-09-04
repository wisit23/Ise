"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { contactSeller } from "../../lib/chat";
import { getAccessToken } from "../../lib/auth";

/** Opens (or re-opens) the Buyer↔Seller conversation for one product, then
 * navigates to it. Unauthenticated visitors go to /login instead — this
 * mirrors the existing addToCart()/handleBuyNow() guest-redirect pattern in
 * app/products/[id]/page.js rather than inventing a new convention. */
export default function ContactSellerButton({ productId, className }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const conversation = await contactSeller(productId, token);
      router.push(`/chat/${conversation.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        <span
          className="material-symbols-outlined text-[18px]"
          aria-hidden="true"
        >
          chat
        </span>
        {busy ? "กำลังเปิดแชท..." : "ติดต่อผู้ขาย"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
