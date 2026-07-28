import Link from "next/link";

const CONDITION_STYLE = {
  ดีมาก: "bg-emerald-50 text-emerald-700",
  ดี: "bg-sky-50 text-sky-700",
  พอใช้: "bg-amber-50 text-amber-700",
};

export default function ProductCard({ product }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            ไม่มีรูปภาพ
          </div>
        )}
        {product.condition && (
          <span
            className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              CONDITION_STYLE[product.condition] || "bg-gray-100 text-gray-600"
            }`}
          >
            {product.condition}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm text-gray-800">{product.title}</p>
        <p className="mt-auto text-base font-semibold text-emerald-600">
          ฿{product.price.toLocaleString("th-TH")}
        </p>
        <p className="text-xs text-gray-400">{product.category}</p>
      </div>
    </Link>
  );
}
