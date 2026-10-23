import { redirect } from "next/navigation";

export default function OrdersPage() {
  redirect("/profile?tab=orders");
}
