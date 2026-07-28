"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import { apiFetch } from "../../../lib/api";
import { getAccessToken, getStoredUser } from "../../../lib/auth";

const PRODUCT_STATUS_LABEL = {
  available: "พร้อมขาย",
  reserved: "อยู่ในตะกร้าลูกค้า",
  sold: "ขายแล้ว",
};

const PRODUCT_STATUS_STYLE = {
  available: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  sold: "bg-gray-100 text-gray-500",
};

const ORDER_STATUS_LABEL = {
  pending: "รอลูกค้าชำระเงิน",
  confirmed: "ยืนยันแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "ขายสำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

const ORDER_STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-sky-50 text-sky-700",
  shipped: "bg-sky-50 text-sky-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function SellerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const storedUser = getStoredUser();
    setUser(storedUser);
    if (storedUser?.role !== "SELLER") {
      setLoading(false);
      return;
    }

    Promise.all([
      apiFetch("/api/products/mine", { token }),
      apiFetch("/api/orders/selling", { token }),
    ])
      .then(([productData, orderData]) => {
        setProducts(productData.items);
        setOrders(orderData.items);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (user === undefined || loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-gray-500">
          กำลังโหลด...
        </p>
      </main>
    );
  }

  if (user?.role !== "SELLER") {
    return (
      <main className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="mx-auto max-w-6xl px-4 py-10 text-amber-800">
          หน้านี้ใช้ได้เฉพาะบัญชีผู้ขายเท่านั้น
        </p>
      </main>
    );
  }

  const totalSales = orders
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.price, 0);

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">แดชบอร์ดผู้ขาย</h1>
          <Link
            href="/sell"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + ลงขายสินค้าใหม่
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">สินค้าที่ลงขาย</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {products.length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">คำสั่งซื้อทั้งหมด</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {orders.length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">ยอดขายสำเร็จ</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              ฿{totalSales.toLocaleString("th-TH")}
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              สินค้าของฉัน
            </h2>
            {products.length === 0 ? (
              <p className="text-sm text-gray-500">ยังไม่มีสินค้าที่ลงขาย</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <ul>
                  {products.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div>
                        <Link
                          href={`/products/${p.id}`}
                          className="font-medium text-gray-900 hover:text-emerald-600"
                        >
                          {p.title}
                        </Link>
                        <p className="text-gray-500">
                          ฿{p.price.toLocaleString("th-TH")}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          PRODUCT_STATUS_STYLE[p.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {PRODUCT_STATUS_LABEL[p.status] || p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              คำสั่งขายของฉัน
            </h2>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-500">ยังไม่มีคำสั่งซื้อเข้ามา</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <ul>
                  {orders.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {o.productTitle}
                        </p>
                        <p className="text-gray-500">
                          ฿{o.price.toLocaleString("th-TH")} ·{" "}
                          {new Date(o.createdAt).toLocaleDateString("th-TH")}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          ORDER_STATUS_STYLE[o.status] ||
                          "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {ORDER_STATUS_LABEL[o.status] || o.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
