/* Shared vocabulary for the three navigation prototypes.

   Everything here points at a route that actually exists — the point of the
   lab is to judge real navigation, not a mock-up with invented destinations.
   Notably absent: wishlist and notifications, which the app does not have. */

/** Ways to find something to buy. Used every visit. */
export const DISCOVERY = [
  { href: "/products", label: "สินค้าทั้งหมด", icon: "storefront" },
  { href: "/swipe", label: "ปัดดู", icon: "swipe" },
  { href: "/auctions", label: "ประมูล", icon: "gavel" },
];

/** The buyer's own things. Occasional, but must always be findable. */
export const MY_STUFF = [
  { href: "/orders", label: "คำสั่งซื้อของฉัน", icon: "receipt_long" },
  { href: "/profile", label: "โปรไฟล์", icon: "person" },
  { href: "/support/tickets", label: "แจ้งปัญหา", icon: "support_agent" },
  { href: "/help", label: "ช่วยเหลือ", icon: "help" },
];

/* Fallback only. The lab fetches the real category list and uses this if the
   backend is down, so the layout can still be judged. */
export const FALLBACK_CATEGORIES = [
  "เสื้อยืด",
  "กางเกง",
  "รองเท้า",
  "กระเป๋า",
  "เดรส",
  "แจ็คเก็ต",
  "เครื่องประดับ",
  "หมวก",
];

export const MOBILE_TABS = [
  { href: "/", label: "หน้าแรก", icon: "home" },
  { href: "/products", label: "ค้นหา", icon: "search" },
  { href: "/swipe", label: "ปัดดู", icon: "swipe" },
  { href: "/cart", label: "ตะกร้า", icon: "shopping_cart", badge: true },
  { href: "/profile", label: "บัญชี", icon: "person" },
];
