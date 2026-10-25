"use client";

import { useParams } from "next/navigation";
import StoreContent from "../../../components/seller/StoreContent";

export default function StorePage() {
  const { sellerId } = useParams();
  return <StoreContent sellerId={sellerId} />;
}
