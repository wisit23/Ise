"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import KycForm from "../../../components/seller/onboarding/KycForm";
import KycStatusCard from "../../../components/seller/onboarding/KycStatusCard";
import { isCompleteIdCard } from "../../../components/seller/onboarding/IdCardField";
import Button from "../../../components/ui/Button";
import ErrorState from "../../../components/ui/ErrorState";
import Skeleton from "../../../components/ui/Skeleton";
import { apiFetch, submitKyc } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const STATUS_LABEL = {
  NONE: "ยังไม่ได้ยืนยันตัวตน",
  PENDING: "รอการตรวจสอบ (Pending)",
  VERIFIED: "ยืนยันตัวตนเรียบร้อย (Verified)",
  REJECTED: "การยืนยันครั้งก่อนถูกปฏิเสธ",
};

function Shell({ children }) {
  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <NavBar />
      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        {children}
      </section>
      <Footer />
    </main>
  );
}

export default function SellerOnboardingPage() {
  const router = useRouter();

  const [user, setUser] = useState(undefined);
  const [status, setStatus] = useState(null); // { kycStatus, sellerProfile, latestApplication }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    shopName: "",
    idCardNumber: "",
    address: "",
    bankAccount: "",
  });
  const [documentFile, setDocumentFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login?next=/seller/onboarding");
      return;
    }
    setUser(getStoredUser());
    setLoading(true);
    setLoadError("");
    apiFetch("/api/auth/kyc/mine", { token })
      .then((data) => {
        setStatus(data);
        if (data.sellerProfile) {
          setForm({
            shopName: data.sellerProfile.shopName || "",
            idCardNumber: data.sellerProfile.idCardNumber || "",
            address: data.sellerProfile.address || "",
            bankAccount: data.sellerProfile.bankAccount || "",
          });
        }
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(load, [load]);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocumentFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!documentFile) {
      setError("กรุณาอัปโหลดรูปถ่ายบัตรประชาชนเพื่อยืนยันตัวตน");
      return;
    }
    if (!isCompleteIdCard(form.idCardNumber)) {
      setError("กรุณากรอกรหัสบัตรประชาชน 13 หลักให้ถูกต้อง");
      return;
    }

    setSubmitting(true);
    try {
      await submitKyc(
        {
          shopName: form.shopName,
          idCardNumber: form.idCardNumber.replace(/\D/g, ""),
          address: form.address,
          bankAccount: form.bankAccount,
        },
        documentFile,
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (user === undefined || loading) {
    return (
      <Shell>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <div className="mt-6 rounded-xl border border-line bg-white p-8">
          <Skeleton.Text lines={6} />
        </div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <ErrorState
          description="ไม่สามารถโหลดสถานะการยืนยันตัวตนได้"
          detail={loadError}
          onRetry={load}
        />
      </Shell>
    );
  }

  if (user?.role !== "SELLER") {
    return (
      <Shell>
        <div className="rounded-xl border border-line bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-ink-muted">
            การยืนยันตัวตนผู้ขายใช้ได้เฉพาะบัญชีประเภทผู้ขาย (Seller) เท่านั้น
          </p>
          <Button href="/register" className="mt-4">
            สมัครบัญชีผู้ขาย
          </Button>
        </div>
      </Shell>
    );
  }

  const kycStatus = status?.kycStatus || "NONE";
  const settled = kycStatus === "PENDING" || kycStatus === "VERIFIED";

  return (
    <Shell>
      <div className="mb-6">
        <nav
          aria-label="เส้นทางหน้า"
          className="flex items-center gap-2 text-sm text-ink-subtle"
        >
          <Link href="/" className="focus-ring rounded hover:text-brand-600">
            หน้าแรก
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-gray-800">ยืนยันตัวตนผู้ขาย</span>
        </nav>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          ยืนยันตัวตนผู้ขาย (Seller Verification)
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          กรอกข้อมูลและอัปโหลดรูปถ่ายบัตรประชาชนเพื่อเปิดสิทธิ์ลงขายสินค้าใน
          RE-LOOP — สถานะปัจจุบัน:{" "}
          <span className="font-semibold text-gray-800">
            {STATUS_LABEL[kycStatus]}
          </span>
        </p>
      </div>

      {settled ? (
        <KycStatusCard status={status} statusLabel={STATUS_LABEL[kycStatus]} />
      ) : (
        <KycForm
          form={form}
          onFormChange={setForm}
          rejected={kycStatus === "REJECTED"}
          rejectionReason={status?.latestApplication?.reason}
          preview={imagePreview}
          onFileSelect={handleFileSelect}
          error={error}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </Shell>
  );
}
