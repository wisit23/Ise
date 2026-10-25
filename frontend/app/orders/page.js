import { redirect } from "next/navigation";

// Orders live under the profile's orders tab. Keep ?orderId= so links from
// notifications still open that order's detail.
export default async function OrdersPage({ searchParams }) {
  const query = (await searchParams) || {};
  const params = new URLSearchParams({ tab: "orders" });
  const orderId = Array.isArray(query.orderId) ? query.orderId[0] : query.orderId;
  if (orderId) params.set("orderId", orderId);
  redirect(`/profile?${params.toString()}`);
}
