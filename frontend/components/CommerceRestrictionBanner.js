"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { getAccessToken } from "../lib/auth";

const SCOPE_LABEL = {
  BUYER_COMMERCE: "สิทธิ์การซื้อ",
  SELLER_COMMERCE: "สิทธิ์การขาย",
};

export default function CommerceRestrictionBanner() {
  const [restriction, setRestriction] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        setRestriction(null);
        return;
      }
      try {
        const data = await apiFetch("/api/auth/me/commerce-restriction", {
          token,
        });
        if (!cancelled) setRestriction(data);
      } catch {
        if (!cancelled) setRestriction(null);
      }
    }

    load();
    window.addEventListener("reloop:auth", load);
    return () => {
      cancelled = true;
      window.removeEventListener("reloop:auth", load);
    };
  }, []);

  if (!restriction?.commerceRestrictions?.length) return null;

  const scopes = restriction.commerceRestrictions
    .map((scope) => SCOPE_LABEL[scope] || scope)
    .join(" และ ");

  return (
    <section
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
    >
      <div className="mx-auto max-w-7xl">
        <p className="font-bold">บัญชีนี้ถูกจำกัด{scopes}</p>
        <p className="mt-1 text-sm">
          คุณยังเข้าสู่ระบบ ดูข้อมูลเดิม และอ่านข้อความแจ้งเตือนได้
          แต่ไม่สามารถเริ่มรายการซื้อหรือขายใหม่ในขอบเขตที่ถูกจำกัด
        </p>
        {restriction.latestEvent?.reason && (
          <p className="mt-1 text-sm">
            <span className="font-semibold">เหตุผล:</span>{" "}
            {restriction.latestEvent.reason}
          </p>
        )}
        {!restriction.appealSubmissionAvailable && (
          <p className="mt-1 text-xs text-amber-800">
            การยื่นอุทธรณ์แบบติดตามสถานะยังไม่พร้อมใช้งาน
            เนื่องจากยังไม่มีที่เก็บคำอุทธรณ์และหลักฐานที่ถูกประเภท
          </p>
        )}
      </div>
    </section>
  );
}
