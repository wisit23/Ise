"use client";

import { Suspense } from "react";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import MyOrders from "../../components/orders/MyOrders";

export default function OrdersPage() {
  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Suspense fallback={null}>
          <MyOrders headingAs="h1" />
        </Suspense>
      </div>
      <Footer />
    </main>
  );
}
