"use client";

/* Loading used to be the string "กำลังโหลด..." on 33 screens, which meant the
   layout jumped the moment data arrived. These placeholders occupy the shape
   the real content will take. */

function Base({ className = "" }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function Text({ lines = 3, className = "" }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Base
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/* Mirrors ProductCard: square media area, two text lines, a price line. */
function Card() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-white">
      <Base className="aspect-square w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Base className="h-3 w-full" />
        <Base className="h-3 w-3/4" />
        <Base className="mt-1 h-4 w-1/3" />
      </div>
    </div>
  );
}

function CardGrid({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} />
      ))}
    </div>
  );
}

function Row({ columns = 5 }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <Base className="h-3 w-full" />
        </td>
      ))}
    </tr>
  );
}

const Skeleton = Object.assign(Base, { Text, Card, CardGrid, Row });

export default Skeleton;
