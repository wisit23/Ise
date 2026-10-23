"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import Pagination from "../../components/Pagination";
import { apiFetch } from "../../lib/api";
import {
  getAccessToken,
  getCurrentRoles,
  isCustomerAccountRoles,
} from "../../lib/auth";

export default function WishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision((value) => value + 1);
    window.addEventListener("reloop:wishlist", changed);
    window.addEventListener("reloop:auth", changed);
    return () => {
      window.removeEventListener("reloop:wishlist", changed);
      window.removeEventListener("reloop:auth", changed);
    };
  }, []);
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login?next=%2Fwishlist");
      return;
    }
    if (!isCustomerAccountRoles(getCurrentRoles())) {
      setItems([]);
      setLoading(false);
      setError("รายการโปรดใช้ได้เฉพาะบัญชีผู้ซื้อและผู้ขาย");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    apiFetch(`/api/products/wishlist?page=${page}&limit=12`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (page > Math.max(1, data.totalPages))
          setPage(Math.max(1, data.totalPages));
        setItems(data.items);
        setTotalPages(data.totalPages);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, revision, router]);

  return (
    <main className="flex min-h-screen flex-col bg-surface-subtle">
      <NavBar />
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-ink">รายการโปรดของฉัน</h1>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : loading ? (
          <p role="status">กำลังโหลด...</p>
        ) : items.length === 0 ? (
          <p>ยังไม่มีสินค้าในรายการโปรด</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
            />
          </>
        )}
      </section>
      <Footer />
    </main>
  );
}
