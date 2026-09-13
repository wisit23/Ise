"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import KycForm from "../../../components/seller/onboarding/KycForm";
import KycStatusCard from "../../../components/seller/onboarding/KycStatusCard";
import VerifyMethodPicker from "../../../components/seller/onboarding/VerifyMethodPicker";
import ThaiIdQrStep from "../../../components/seller/onboarding/ThaiIdQrStep";
import BankAccountStep from "../../../components/seller/onboarding/BankAccountStep";
import { isCompleteIdCard } from "../../../components/seller/onboarding/IdCardField";
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

/** StepIndicator — แสดงขั้นตอนสำหรับ Thai ID flow */
function StepIndicator({ step }) {
  const steps = ["เลือกวิธี", "สแกน QR", "บัญชีธนาคาร"];
  const currentIndex = step === "pick" ? 0 : step === "qr" ? 1 : 2;

  return (
    <div className="mb-6 flex items-center gap-2">
      {steps.map((label, idx) => {
        const done = idx < currentIndex;
        const active = idx === currentIndex;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  done
                    ? "bg-brand-500 text-white"
                    : active
                      ? "bg-brand-500 text-white ring-2 ring-brand-300"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {done ? (
                  <span className="material-symbols-outlined text-[14px]">check</span>
                ) : (
                  idx + 1
                )}
              </span>
              <span
                className={`text-xs font-medium ${
                  active ? "text-brand-700" : done ? "text-gray-600" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 min-w-[20px] rounded transition-colors ${
                  done ? "bg-brand-400" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SellerOnboardingPage() {
  const router = useRouter();

  const [user, setUser] = useState(undefined);
  const [status, setStatus] = useState(null); // { kycStatus, sellerProfile, latestApplication }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  // ---- วิธีที่ 1: ฟอร์มเดิม ----
  const [form, setForm] = useState({
    shopName: "",
    idCardNumber: "",
    idCardExpiry: "",
    address: "",
    bankAccount: "",
  });
  const [documentFile, setDocumentFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ---- วิธีที่ 2: Thai ID QR flow ----
  // verifyMethod: 'manual' | 'thai_id'
  const [verifyMethod, setVerifyMethod] = useState("manual");
  // thaiIdStep: 'qr' | 'bank'  (ใช้เฉพาะเมื่อ verifyMethod === 'thai_id')
  const [thaiIdStep, setThaiIdStep] = useState("qr");
  // ข้อมูลที่ได้จาก Thai ID หลังสแกน
  const [thaiIdData, setThaiIdData] = useState(null);
  // ชื่อร้านและบัญชีธนาคารที่แก้ไขได้ในขั้น bank
  const [thaiIdShopName, setThaiIdShopName] = useState("");
  const [thaiIdBankAccount, setThaiIdBankAccount] = useState("");

  // currentStep ใช้สำหรับ StepIndicator
  const currentStep =
    verifyMethod === "thai_id"
      ? thaiIdStep === "qr"
        ? "qr"
        : "bank"
      : "pick";

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
          const rawExpiry = data.sellerProfile.idCardExpiry;
          const formattedExpiry = rawExpiry
            ? new Date(rawExpiry).toISOString().split("T")[0]
            : "";
          setForm({
            shopName: data.sellerProfile.shopName || "",
            idCardNumber: data.sellerProfile.idCardNumber || "",
            idCardExpiry: formattedExpiry,
            address: data.sellerProfile.address || "",
            bankAccount: data.sellerProfile.bankAccount || "",
          });
        }
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(load, [load]);

  // ---- Handlers วิธีที่ 1 ----
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocumentFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmitManual(e) {
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
          idCardExpiry: form.idCardExpiry || undefined,
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

  // ---- Handlers วิธีที่ 2 ----
  function handleThaiIdScanned(data) {
    setThaiIdData(data);
  }

  function handleThaiIdNext() {
    setThaiIdStep("bank");
  }

  function handleBackToQr() {
    setThaiIdStep("qr");
    setError("");
  }

  function handleBackToPick() {
    setVerifyMethod("manual");
    setThaiIdStep("qr");
    setThaiIdData(null);
    setError("");
  }

  async function handleSubmitThaiId(e) {
    e.preventDefault();
    setError("");

    if (!thaiIdShopName.trim()) {
      setError("กรุณากรอกชื่อร้านค้า");
      return;
    }
    if (!thaiIdData) {
      setError("กรุณาสแกน QR Thai ID ก่อน");
      return;
    }

    setSubmitting(true);
    try {
      // ส่งข้อมูลโดยใช้ข้อมูลจาก Thai ID เป็นหลัก
      // backend จะรับรู้ว่าเป็น thai_id method จาก verifyMethod field
      await submitKyc(
        {
          shopName: thaiIdShopName,
          idCardNumber: thaiIdData.idNumber.replace(/\D/g, ""),
          address: thaiIdData.address,
          bankAccount: thaiIdBankAccount,
          // ส่งข้อมูลเพิ่มเติมจาก Thai ID
          verifyMethod: "thai_id",
          thaiIdFullName: thaiIdData.fullName,
          thaiIdPhone: thaiIdData.phone,
        },
        // วิธีที่ 2 ไม่มีไฟล์รูปบัตร — ส่ง null
        null,
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Loading / Error states ----
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

  const kycStatus = status?.kycStatus || "NONE";
  const settled = kycStatus === "PENDING" || kycStatus === "VERIFIED";

  return (
    <Shell>
      {/* Breadcrumb + Header */}
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

      {/* Settled: แสดงสถานะ */}
      {settled ? (
        <KycStatusCard status={status} statusLabel={STATUS_LABEL[kycStatus]} />
      ) : (
        <div className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8">
          {/* === วิธีที่ 2 — Thai ID QR flow === */}
          {verifyMethod === "thai_id" ? (
            <>
              <StepIndicator step={currentStep} />

              {thaiIdStep === "qr" ? (
                <ThaiIdQrStep
                  thaiIdData={thaiIdData}
                  onScanned={handleThaiIdScanned}
                  onNext={handleThaiIdNext}
                  onBack={handleBackToPick}
                />
              ) : (
                <BankAccountStep
                  thaiIdData={thaiIdData}
                  bankAccount={thaiIdBankAccount}
                  onChange={setThaiIdBankAccount}
                  shopName={thaiIdShopName}
                  onShopNameChange={setThaiIdShopName}
                  error={error}
                  submitting={submitting}
                  onSubmit={handleSubmitThaiId}
                  onBack={handleBackToQr}
                />
              )}
            </>
          ) : (
            /* === วิธีที่ 1 — ฟอร์มเดิม + picker ด้านบน === */
            <>
              {/* Method Picker */}
              <div className="mb-6">
                <VerifyMethodPicker
                  method={verifyMethod}
                  onChange={(m) => {
                    setVerifyMethod(m);
                    setError("");
                    if (m === "thai_id") {
                      setThaiIdStep("qr");
                      setThaiIdData(null);
                    }
                  }}
                />
              </div>

              <div className="border-t border-line pt-6">
                <KycForm
                  form={form}
                  onFormChange={setForm}
                  rejected={kycStatus === "REJECTED"}
                  rejectionReason={status?.latestApplication?.reason}
                  preview={imagePreview}
                  onFileSelect={handleFileSelect}
                  error={error}
                  submitting={submitting}
                  onSubmit={handleSubmitManual}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
