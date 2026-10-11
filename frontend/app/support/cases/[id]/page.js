"use client";
import { useParams } from "next/navigation";
import CustomerDisputeCase from "../../../../components/orders/CustomerDisputeCase";

// Links use the order id; the API resolves its dispute and enforces ownership.
export default function DisputeCasePage() {
  const { id } = useParams();
  return <CustomerDisputeCase orderId={id} />;
}
