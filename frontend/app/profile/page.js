"use client";
import ReferenceCode from "../../components/ui/ReferenceCode";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Textarea from "../../components/ui/Textarea";
import Modal from "../../components/ui/Modal";
import Alert from "../../components/ui/Alert";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StyleProfileForm from "../../components/profile/StyleProfileForm";
import MyOrders from "../../components/orders/MyOrders";
import { apiFetch } from "../../lib/api";
import { validateAddressContact } from "../../lib/addressValidation";
import { PHONE_HINT, PHONE_MAX_LENGTH, PHONE_PATTERN, phoneDigits } from "../../lib/phone";
import {
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveSession,
} from "../../lib/auth";

const ROLE_LABEL = {
  BUYER: "ผู้ซื้อ",
  SELLER: "ผู้ขาย",
  ADMIN: "Trust and Safety",
  TRUST_AND_SAFETY: "Trust and Safety",
  CUSTOMER_SERVICE: "ฝ่ายบริการลูกค้า",
  MARKETING: "การตลาด",
  EXECUTIVE: "ผู้บริหาร",
};

const ORDER_STATUSES = [
  {
    key: "pending_payment",
    statuses: ["pending_payment"],
    label: "รอชำระเงิน",
    icon: "payments",
    badgeColor: "bg-amber-100 text-amber-800",
  },
  {
    key: "paid",
    statuses: ["paid"],
    label: "รอผู้ขายยืนยัน",
    icon: "inventory_2",
    badgeColor: "bg-sky-100 text-sky-800",
  },
  {
    key: "pickup_in_progress",
    statuses: ["pickup_in_progress"],
    label: "ขนส่งกำลังเข้ารับสินค้า",
    icon: "inventory_2",
    badgeColor: "bg-indigo-100 text-indigo-800",
  },
  {
    key: "in_transit",
    statuses: ["in_transit"],
    label: "กำลังจัดส่ง",
    icon: "local_shipping",
    badgeColor: "bg-indigo-100 text-indigo-800",
  },
  {
    key: "completed",
    statuses: ["completed"],
    label: "สำเร็จ",
    icon: "check_circle",
    badgeColor: "bg-emerald-100 text-emerald-800",
  },
];

function toCouponView(voucher) {
  const campaign = voucher.campaign || {};
  const isActive = voucher.status === "CLAIMED" && !voucher.usedOrderId;
  return {
    id: voucher.id,
    code: campaign.code || "-",
    title: campaign.name || campaign.code || "Voucher",
    description: campaign.description || "Voucher จากแคมเปญ Marketing",
    minSpend: Number(campaign.minOrderPrice || 0),
    discountAmount:
      campaign.discountType === "PERCENT"
        ? `${campaign.discountValue || 0}%`
        : `฿${Number(campaign.discountValue || 0).toLocaleString("th-TH")}`,
    discountType: campaign.discountType,
    expiresAt: campaign.endsAt
      ? new Date(campaign.endsAt).toLocaleDateString("th-TH", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "ไม่ระบุ",
    category: campaign.applicableCategory || "ทุกหมวดหมู่",
    status: isActive ? "active" : "expired",
  };
}

const BLANK_ADDRESS = {
  recipientName: "",
  phone: "",
  addressLine: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  isDefault: false,
};

export default function ProfilePage() {
  return (
    <Suspense fallback={<p role="status">กำลังโหลด...</p>}>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const router = useRouter();
  const requestedTab = useSearchParams().get("tab");
  const selectedTab = ["orders", "address", "coupons"].includes(requestedTab)
    ? requestedTab
    : "profile";
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // Navigation tab: 'profile' | 'orders' | 'address' | 'coupons'
  const [activeTab, setActiveTab] = useState(selectedTab);

  // Orders state — loaded from order-service PostgreSQL through the gateway.
  const [orderView, setOrderView] = useState({ tab: "all", key: 0 });
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    setActiveTab(selectedTab);
    if (selectedTab === "orders") {
      setOrderView((current) => ({ tab: "all", key: current.key + 1 }));
    }
  }, [selectedTab]);

  // Address state — persisted by auth-service in Docker PostgreSQL.
  const [addresses, setAddresses] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressFieldErrors, setAddressFieldErrors] = useState({});
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressFormData, setAddressFormData] = useState(BLANK_ADDRESS);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const [addressNotice, setAddressNotice] = useState("");

  // Coupons state
  const [coupons, setCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponError, setCouponError] = useState("");
  const [copiedCode, setCopiedCode] = useState(null);
  const [couponFilter, setCouponFilter] = useState("active");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const storedUser = getStoredUser();
    if (storedUser) setForm(storedUser);

    apiFetch("/api/orders/mine?limit=50", { token })
      .then((data) => setOrders(Array.isArray(data?.items) ? data.items : []))
      .catch((err) => console.error("โหลดสรุปคำสั่งซื้อไม่สำเร็จ:", err));

    apiFetch("/api/products/campaigns/my-vouchers", { token })
      .then((data) => {
        const items = Array.isArray(data) ? data : data?.items || [];
        setCoupons(items.map(toCouponView));
      })
      .catch((err) => setCouponError(err.message || "โหลด Voucher ไม่สำเร็จ"))
      .finally(() => setCouponsLoading(false));

    Promise.all([
      apiFetch("/api/auth/me", { token }),
      apiFetch("/api/auth/me/addresses", { token }),
    ])
      .then(([user, savedAddresses]) => {
        setForm(user);
        setAddresses(savedAddresses);
        saveSession({
          accessToken: token,
          refreshToken: getRefreshToken(),
          user,
        });
      })
      .catch((err) => {
        setError(err.message || "โหลดข้อมูลโปรไฟล์ไม่สำเร็จ");
      });
  }, [router]);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const token = getAccessToken();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const updated = await apiFetch("/api/auth/me", {
        method: "PATCH",
        token,
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
        },
      });
      saveSession({
        accessToken: token,
        refreshToken: getRefreshToken(),
        user: updated,
      });
      setForm(updated);
      setNotice("บันทึกข้อมูลส่วนตัวสำเร็จ");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Address handlers
  async function loadAddresses(token = getAccessToken()) {
    const savedAddresses = await apiFetch("/api/auth/me/addresses", { token });
    setAddresses(savedAddresses);
  }

  function handleOpenAddAddress() {
    setEditingAddress(null);
    setAddressFormData(BLANK_ADDRESS);
    setAddressError("");
    setAddressFieldErrors({});
    setAddressModalOpen(true);
  }

  function handleOpenEditAddress(addr) {
    setEditingAddress(addr);
    setAddressFormData({ ...addr });
    setAddressError("");
    setAddressFieldErrors({});
    setAddressModalOpen(true);
  }

  async function handleSaveAddress(e) {
    e.preventDefault();
    setAddressError("");
    const fieldErrors = validateAddressContact(addressFormData);
    setAddressFieldErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setAddressLoading(true);

    const body = {
      recipientName: addressFormData.recipientName,
      phone: addressFormData.phone,
      addressLine: addressFormData.addressLine,
      subdistrict: addressFormData.subdistrict,
      district: addressFormData.district,
      province: addressFormData.province,
      postalCode: addressFormData.postalCode,
      isDefault: addressFormData.isDefault,
    };

    try {
      await apiFetch(
        editingAddress
          ? `/api/auth/me/addresses/${editingAddress.id}`
          : "/api/auth/me/addresses",
        {
          method: editingAddress ? "PATCH" : "POST",
          token: getAccessToken(),
          body,
        },
      );
      await loadAddresses();
      setAddressNotice(
        editingAddress
          ? "อัปเดตที่อยู่เรียบร้อยแล้ว"
          : "เพิ่มที่อยู่ใหม่เรียบร้อยแล้ว",
      );
      setAddressModalOpen(false);
      setTimeout(() => setAddressNotice(""), 4000);
    } catch (err) {
      setAddressError(err.message || "บันทึกที่อยู่ไม่สำเร็จ");
    } finally {
      setAddressLoading(false);
    }
  }

  async function handleSetDefaultAddress(id) {
    setAddressLoading(true);
    setAddressError("");
    try {
      await apiFetch(`/api/auth/me/addresses/${id}/default`, {
        method: "PATCH",
        token: getAccessToken(),
      });
      await loadAddresses();
      setAddressNotice("ตั้งเป็นที่อยู่เริ่มต้นเรียบร้อยแล้ว");
      setTimeout(() => setAddressNotice(""), 3000);
    } catch (err) {
      setAddressError(err.message || "ตั้งค่าที่อยู่เริ่มต้นไม่สำเร็จ");
    } finally {
      setAddressLoading(false);
    }
  }

  async function handleDeleteAddress() {
    if (!addressToDelete) return;
    setAddressLoading(true);
    setAddressError("");
    try {
      await apiFetch(`/api/auth/me/addresses/${addressToDelete.id}`, {
        method: "DELETE",
        token: getAccessToken(),
      });
      await loadAddresses();
      setAddressToDelete(null);
      setAddressNotice("ลบที่อยู่ออกแล้ว");
      setTimeout(() => setAddressNotice(""), 3000);
    } catch (err) {
      setAddressError(err.message || "ลบที่อยู่ไม่สำเร็จ");
    } finally {
      setAddressLoading(false);
    }
  }

  function handleCopyCode(code) {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  }

  function selectTab(tab) {
    setActiveTab(tab);
    router.replace(`/profile?tab=${tab}`, {
      scroll: false,
    });
  }

  // Order status click shortcut
  function handleStatusShortcutClick(statusKey) {
    setActiveTab("orders");
    setOrderView((current) => ({ tab: statusKey, key: current.key + 1 }));
  }

  const filteredCoupons =
    couponFilter === "all"
      ? coupons
      : coupons.filter((c) => c.status === couponFilter);

  // Status counts are derived only from order-service data.
  const statusCounts = Object.fromEntries(
    ORDER_STATUSES.map((option) => [
      option.key,
      orders.filter((order) => option.statuses.includes(order.status)).length,
    ]),
  );

  if (!form) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-4xl px-4 py-10 text-center text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <NavBar />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* Top Profile Summary Header Card */}
        <div className="mb-6 overflow-hidden rounded-xl border border-line bg-white p-6 shadow-1">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700 ring-4 ring-brand-50">
                {form.firstName ? form.firstName[0].toUpperCase() : "U"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900">
                    {form.firstName} {form.lastName}
                  </h1>
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                    {ROLE_LABEL[form.role] || form.role}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {form.email}
                  {form.phone && <span> · {form.phone}</span>}
                </p>
                {form.referenceCode && <ReferenceCode value={form} className="mt-2 text-xs text-ink-muted" />}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 sm:border-t-0 sm:pt-0">
              <div className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3.5 py-2 text-xs text-ink-muted">
                <span className="material-symbols-outlined text-[18px] text-brand-600">
                  location_on
                </span>
                <span>{addresses.length} ที่อยู่จัดส่ง</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3.5 py-2 text-xs text-ink-muted">
                <span className="material-symbols-outlined text-[18px] text-amber-500">
                  confirmation_number
                </span>
                <span>
                  {coupons.filter((c) => c.status === "active").length}{" "}
                  โค้ดส่วนลด
                </span>
              </div>
            </div>
          </div>

          {/* Quick Order Status Tracking Strip */}
          <div className="mt-6 border-t border-line pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <span className="material-symbols-outlined text-[18px] text-brand-600">
                  local_mall
                </span>
                สถานะคำสั่งซื้อของฉัน
              </h2>
              <Link
                href="/profile?tab=orders"
                className="focus-ring flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                ดูประวัติทั้งหมด
                <span className="material-symbols-outlined text-[14px]">
                  arrow_forward
                </span>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ORDER_STATUSES.map((st) => {
                const count = statusCounts[st.key] || 0;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => handleStatusShortcutClick(st.key)}
                    className="group relative flex items-center gap-3 rounded-lg border border-line bg-surface-subtle p-3 text-left transition hover:border-brand-500 hover:bg-white hover:shadow-1"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-gray-700 shadow-sm group-hover:bg-brand-50 group-hover:text-brand-700">
                      <span className="material-symbols-outlined text-[22px]">
                        {st.icon}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-600 group-hover:text-brand-700">
                        {st.label}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-gray-900">
                        {count > 0 ? `${count} รายการ` : "ไม่มีรายการ"}
                      </p>
                    </div>
                    {count > 0 && (
                      <span className="absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Tab Bar Navigation */}
        <div className="flex overflow-x-auto border-b border-line bg-white px-2 shadow-1 rounded-t-lg">
          <button
            type="button"
            onClick={() => selectTab("profile")}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-medium transition ${
              activeTab === "profile"
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="material-symbols-outlined text-[19px]">
              person
            </span>
            ข้อมูลส่วนตัว
          </button>
          <button
            type="button"
            onClick={() => {
              setOrderView((current) => ({ tab: "all", key: current.key + 1 }));
              selectTab("orders");
            }}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-medium transition ${
              activeTab === "orders"
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="material-symbols-outlined text-[19px]">
              inventory_2
            </span>
            คำสั่งซื้อของฉัน
            {orders.length > 0 && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-xs font-semibold text-gray-600">
                {orders.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => selectTab("address")}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-medium transition ${
              activeTab === "address"
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="material-symbols-outlined text-[19px]">
              location_on
            </span>
            ที่อยู่จัดส่ง
            <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-xs font-semibold text-gray-600">
              {addresses.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => selectTab("coupons")}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-medium transition ${
              activeTab === "coupons"
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <span className="material-symbols-outlined text-[19px]">
              confirmation_number
            </span>
            โค้ดส่วนลดของฉัน
            <span className="rounded-full bg-brand-50 px-1.5 py-0.2 text-xs font-semibold text-brand-700">
              {coupons.filter((c) => c.status === "active").length}
            </span>
          </button>
        </div>

        {/* Tab 1: ข้อมูลส่วนตัว (Personal Info) */}
        {activeTab === "profile" && (
          <section className="rounded-b-lg border border-t-0 border-line bg-white p-6 shadow-1">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                ตั้งค่าข้อมูลส่วนตัว
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                แก้ไขข้อมูลชื่อ นามสกุล และเบอร์โทรศัพท์สำหรับติดต่อ
              </p>
            </div>

            {error && (
              <Alert tone="error" className="mb-4">
                {error}
              </Alert>
            )}
            {notice && (
              <Alert tone="success" className="mb-4">
                {notice}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="ชื่อ"
                  required
                  value={form.firstName || ""}
                  onChange={update("firstName")}
                  placeholder="ชื่อจริง"
                />
                <Input
                  label="นามสกุล"
                  required
                  value={form.lastName || ""}
                  onChange={update("lastName")}
                  placeholder="นามสกุล"
                />
              </div>

              <Input
                label="อีเมล"
                value={form.email || ""}
                disabled
                hint="อีเมลที่ลงทะเบียน ไม่สามารถเปลี่ยนได้ด้วยตนเอง"
              />

              <Input
                label="เบอร์โทรศัพท์"
                value={form.phone || ""}
                onChange={(e) =>
                  setForm({ ...form, phone: phoneDigits(e.target.value) })
                }
                inputMode="numeric"
                maxLength={PHONE_MAX_LENGTH}
                pattern={PHONE_PATTERN}
                title={PHONE_HINT}
                placeholder="เช่น 0812345678"
                hint="ใช้สำหรับติดต่อประสานงานการจัดส่งสินค้า"
              />

              <div className="pt-2">
                <Button type="submit" loading={loading} icon="save">
                  บันทึกการเปลี่ยนแปลง
                </Button>
              </div>
            </form>
            {["BUYER", "SELLER"].includes(form.role) && <StyleProfileForm />}
          </section>
        )}

        {/* Tab 2: คำสั่งซื้อของฉัน (Order Status Tracking) */}
        {activeTab === "orders" && (
          <section className="rounded-b-lg border border-t-0 border-line bg-white p-6 shadow-1">
            <MyOrders key={orderView.key} initialTab={orderView.tab} />
          </section>
        )}

        {/* Tab 3: ที่อยู่จัดส่ง (Delivery Addresses) */}
        {activeTab === "address" && (
          <section className="rounded-b-lg border border-t-0 border-line bg-white p-6 shadow-1">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  ที่อยู่สำหรับจัดส่ง
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  จัดการที่อยู่สำหรับรับสินค้าของคุณ
                  สามารถตั้งที่อยู่เริ่มต้นได้
                </p>
              </div>
              <Button
                variant="primary"
                icon="add"
                onClick={handleOpenAddAddress}
              >
                เพิ่มที่อยู่ใหม่
              </Button>
            </div>

            {addressNotice && (
              <Alert tone="success" className="mb-4">
                {addressNotice}
              </Alert>
            )}
            {addressError && (
              <Alert tone="error" className="mb-4">
                {addressError}
              </Alert>
            )}

            {addresses.length === 0 ? (
              <EmptyState
                icon="location_off"
                title="ยังไม่มีที่อยู่จัดส่ง"
                description="เพิ่มที่อยู่จัดส่งเพื่อความสะดวกและรวดเร็วในการสั่งซื้อสินค้า"
                action={
                  <Button icon="add" onClick={handleOpenAddAddress}>
                    เพิ่มที่อยู่ใหม่
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`relative flex flex-col justify-between rounded-lg border p-5 transition ${
                      addr.isDefault
                        ? "border-brand-500 bg-brand-50/20 shadow-sm"
                        : "border-line bg-white hover:border-gray-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {addr.recipientName}
                          </span>
                          {addr.isDefault && (
                            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                              ค่าเริ่มต้น
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="mt-1 text-sm text-gray-600">
                        <span className="material-symbols-outlined mr-1 inline-block text-[15px] align-middle text-ink-subtle">
                          call
                        </span>
                        {addr.phone}
                      </p>

                      <p className="mt-2 text-sm leading-relaxed text-gray-700">
                        {addr.addressLine} แขวง/ตำบล{addr.subdistrict} เขต/อำเภอ
                        {addr.district} จังหวัด{addr.province} {addr.postalCode}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-xs">
                      <div>
                        {!addr.isDefault ? (
                          <button
                            type="button"
                            disabled={addressLoading}
                            onClick={() => handleSetDefaultAddress(addr.id)}
                            className="font-medium text-brand-700 hover:underline disabled:opacity-50"
                          >
                            ตั้งเป็นค่าเริ่มต้น
                          </button>
                        ) : (
                          <span className="text-ink-subtle">ที่อยู่หลัก</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="edit"
                          onClick={() => handleOpenEditAddress(addr)}
                        >
                          แก้ไข
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="delete"
                          className="text-danger hover:text-red-700 hover:bg-red-50"
                          onClick={() => setAddressToDelete(addr)}
                        >
                          ลบ
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Tab 4: โค้ดส่วนลดของฉัน (Discount Codes / Coupons) */}
        {activeTab === "coupons" && (
          <section className="rounded-b-lg border border-t-0 border-line bg-white p-6 shadow-1">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                โค้ดส่วนลดของฉัน
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Voucher ที่คุณรับจากแคมเปญ Marketing และสถานะการใช้งานจริง
              </p>
            </div>

            {couponError && (
              <Alert tone="error" className="mb-4">
                {couponError}
              </Alert>
            )}

            {/* Filter active vs expired */}
            <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3 text-sm font-medium">
              <button
                type="button"
                onClick={() => setCouponFilter("active")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  couponFilter === "active"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-subtle text-gray-600 hover:bg-gray-200"
                }`}
              >
                โค้ดที่ใช้ได้ (
                {coupons.filter((c) => c.status === "active").length})
              </button>
              <button
                type="button"
                onClick={() => setCouponFilter("expired")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  couponFilter === "expired"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-subtle text-gray-600 hover:bg-gray-200"
                }`}
              >
                หมดอายุ / ใช้แล้ว (
                {coupons.filter((c) => c.status === "expired").length})
              </button>
              <button
                type="button"
                onClick={() => setCouponFilter("all")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  couponFilter === "all"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-subtle text-gray-600 hover:bg-gray-200"
                }`}
              >
                ทั้งหมด ({coupons.length})
              </button>
            </div>

            {/* Coupon Cards List */}
            {couponsLoading ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                กำลังโหลด Voucher...
              </p>
            ) : filteredCoupons.length === 0 ? (
              <EmptyState
                icon="confirmation_number"
                title="ไม่มีโค้ดส่วนลดในหมวดนี้"
                description="ไปที่หน้าแคมเปญเพื่อรับ Voucher จาก Marketing"
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredCoupons.map((coupon) => {
                  const isExpired = coupon.status === "expired";
                  return (
                    <div
                      key={coupon.id}
                      className={`relative flex flex-col justify-between overflow-hidden rounded-xl border transition ${
                        isExpired
                          ? "border-line bg-gray-50 opacity-60"
                          : "border-line bg-white shadow-1 hover:border-brand-500"
                      }`}
                    >
                      <div className="flex">
                        {/* Left ticket coupon visual badge */}
                        <div
                          className={`flex w-24 shrink-0 flex-col items-center justify-center border-r border-dashed border-line p-3 text-center ${
                            isExpired
                              ? "bg-gray-100 text-gray-400"
                              : "bg-brand-50 text-brand-700"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[28px]">
                            {coupon.discountType === "shipping"
                              ? "local_shipping"
                              : "local_offer"}
                          </span>
                          <span className="mt-1 text-sm font-bold">
                            {coupon.discountAmount}
                          </span>
                        </div>

                        {/* Right ticket info */}
                        <div className="flex-1 p-3.5">
                          <div className="flex items-start justify-between gap-1">
                            <span className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-xs font-bold text-gray-800">
                              {coupon.code}
                            </span>
                            <span className="text-[11px] text-ink-subtle">
                              หมดอายุ {coupon.expiresAt}
                            </span>
                          </div>
                          <h3 className="mt-1 text-sm font-semibold text-gray-900">
                            {coupon.title}
                          </h3>
                          <p className="mt-1 text-xs text-ink-muted">
                            {coupon.description}
                          </p>
                        </div>
                      </div>

                      {/* Ticket Footer Action */}
                      <div className="flex items-center justify-between border-t border-line bg-surface-subtle px-4 py-2.5 text-xs">
                        <span className="text-ink-subtle">
                          ขั้นต่ำ ฿{coupon.minSpend.toLocaleString()}
                        </span>
                        {!isExpired ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyCode(coupon.code)}
                              className="font-medium text-gray-600 hover:text-brand-700"
                            >
                              {copiedCode === coupon.code ? (
                                <span className="flex items-center gap-0.5 text-emerald-600">
                                  <span className="material-symbols-outlined text-[14px]">
                                    check
                                  </span>
                                  คัดลอกแล้ว
                                </span>
                              ) : (
                                "คัดลอกโค้ด"
                              )}
                            </button>
                            <Button
                              href="/products"
                              size="sm"
                              variant="primary"
                              className="py-1 text-xs"
                            >
                              ใช้โค้ด
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            หมดอายุแล้ว
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Modal: เพิ่ม / แก้ไข ที่อยู่จัดส่ง */}
      <Modal
        open={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        title={editingAddress ? "แก้ไขที่อยู่จัดส่ง" : "เพิ่มที่อยู่จัดส่งใหม่"}
        description="กรอกข้อมูลที่อยู่สำหรับจัดส่งพัสดุให้ครบถ้วนและถูกต้อง"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setAddressModalOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              loading={addressLoading}
              onClick={handleSaveAddress}
            >
              บันทึกที่อยู่
            </Button>
          </>
        }
      >
        <form noValidate onSubmit={handleSaveAddress} className="space-y-4">
          {addressError && <Alert tone="error">{addressError}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="ชื่อ-นามสกุล ผู้รับ"
              error={addressFieldErrors.recipientName}
              required
              value={addressFormData.recipientName}
              onChange={(e) =>
                setAddressFormData({
                  ...addressFormData,
                  recipientName: e.target.value,
                })
              }
              placeholder="เช่น นายสมชาย ใจดี"
            />
            <Input
              label="เบอร์โทรศัพท์"
              error={addressFieldErrors.phone}
              inputMode="numeric"
              required
              value={addressFormData.phone}
              onChange={(e) =>
                setAddressFormData({
                  ...addressFormData,
                  phone: phoneDigits(e.target.value),
                })
              }
              placeholder="เช่น 0812345678"
            />
          </div>

          <Textarea
            label="ที่อยู่ (บ้านเลขที่, ซอย, ถนน, อาคาร/หมู่บ้าน)"
            required
            rows={2}
            value={addressFormData.addressLine}
            onChange={(e) =>
              setAddressFormData({
                ...addressFormData,
                addressLine: e.target.value,
              })
            }
            placeholder="เช่น 123/45 ซอยทองหล่อ 10 ถนนสุขุมวิท"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="แขวง / ตำบล"
              required
              value={addressFormData.subdistrict}
              onChange={(e) =>
                setAddressFormData({
                  ...addressFormData,
                  subdistrict: e.target.value,
                })
              }
              placeholder="คลองตันเหนือ"
            />
            <Input
              label="เขต / อำเภอ"
              required
              value={addressFormData.district}
              onChange={(e) =>
                setAddressFormData({
                  ...addressFormData,
                  district: e.target.value,
                })
              }
              placeholder="วัฒนา"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="จังหวัด"
              required
              value={addressFormData.province}
              onChange={(e) =>
                setAddressFormData({
                  ...addressFormData,
                  province: e.target.value,
                })
              }
              placeholder="กรุงเทพมหานคร"
            />
            <Input
              label="รหัสไปรษณีย์"
              error={addressFieldErrors.postalCode}
              inputMode="numeric"
              required
              value={addressFormData.postalCode}
              onChange={(e) =>
                setAddressFormData({
                  ...addressFormData,
                  postalCode: e.target.value,
                })
              }
              placeholder="10110"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isDefaultCheckbox"
              checked={addressFormData.isDefault}
              onChange={(e) =>
                setAddressFormData({
                  ...addressFormData,
                  isDefault: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <label
              htmlFor="isDefaultCheckbox"
              className="text-sm text-gray-700 select-none cursor-pointer"
            >
              ตั้งเป็นที่อยู่จัดส่งเริ่มต้น
            </label>
          </div>
        </form>
      </Modal>

      {/* Confirm Dialog: ลบที่อยู่ */}
      <ConfirmDialog
        open={Boolean(addressToDelete)}
        title="ยืนยันการลบที่อยู่"
        description={`คุณแน่ใจหรือไม่ว่าต้องการลบที่อยู่ของคุณ ${addressToDelete?.recipientName}?`}
        confirmLabel="ลบที่อยู่"
        cancelLabel="ยกเลิก"
        tone="danger"
        onConfirm={handleDeleteAddress}
        onCancel={() => setAddressToDelete(null)}
      />

      <Footer />
    </main>
  );
}
